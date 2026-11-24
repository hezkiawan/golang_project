package booking

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"strings"
	"time"

	catalogpb "golang-microservice-practice/proto"

	"github.com/gofiber/fiber/v3"
	amqp "github.com/rabbitmq/amqp091-go"
)

type BookingHandler struct {
	Repo          *BookingRepository
	CatalogClient catalogpb.CatalogServiceClient
	RabbitChannel *amqp.Channel
}

// CreateBooking godoc
// @Summary      Book a service for a date
// @Description  Creates a pending booking. One service can have only one active booking per date. Admins cannot book.
// @Tags         bookings
// @Accept       json
// @Produce      json
// @Param        body  body      BookingRequest  true  "Service and date"
// @Success      201   {object}  Booking
// @Failure      400   {object}  ErrorResponse  "invalid or past date"
// @Failure      401   {object}  ErrorResponse  "not logged in"
// @Failure      403   {object}  ErrorResponse  "admins cannot create bookings"
// @Failure      409   {object}  ErrorResponse  "already booked on that date"
// @Router       /bookings [post]
func (h *BookingHandler) CreateBooking(c fiber.Ctx) error {

	// bind request to body -> cuma pakai serviceID
	var body BookingRequest
	if err := c.Bind().Body(&body); err != nil || body.ServiceID <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "service id  empty or wrong"})
	}

	// time.Parse uses Go's "reference date" - jadi 2006-01-02 means "year-month-day" format
	date, err := time.Parse("2006-01-02", body.BookingDate)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "booking_date must be YYYY-MM-DD"})
	}

	// "YYYY-MM-DD" strings can be compared like normal strings, so this means "date is before today"
	if body.BookingDate < time.Now().Format("2006-01-02") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "booking_date cannot be in the past"})
	}

	// domain rule: admins manage the system, they don't book services
	role, _ := c.Locals("role").(string)
	if role == "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "admins cannot create bookings"})
	}

	// grpc call : booking -> catalog, checkServiceExists()
	// unary rpc : booking is gonna send one request, catalog is gonna process and return exactly one response
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	// invoke the client and calls CheckServiceExists
	resp, err := h.CatalogClient.CheckServiceExists(ctx, &catalogpb.CheckServiceRequest{ServiceId: body.ServiceID})
	// error handling when gRPC call returns error -> means service unavaiable
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "catalog service unavailable"})
	}
	if !resp.GetExists() {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "service does not exist"})
	}

	// Get user id from fiber local that was gotten from JWT
	userID := c.Locals("userId").(int64)

	// call repository to create booking
	b, err := h.Repo.CreateBooking(body.ServiceID, userID, date)

	if errors.Is(err, ErrAlreadyBooked) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// RABBIT MQ - PUB SUB
	// we need to publish only after the row is saved.
	// Load the names first (same JOIN as the detail page), so the event can carry them
	d, err := h.Repo.GetBookingByID(c.Context(), b.ID)
	if err == nil {
		err = h.publishEvent(c.Context(), "booking.created", BookingCreatedEvent{
			BookingID:   d.ID,
			ServiceID:   d.ServiceID,
			UserID:      d.UserID,
			Username:    d.Username,
			ServiceName: d.ServiceName,
			BookingDate: d.BookingDate,
		})
	}
	if err != nil {
		log.Println("booking.created:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "event publish failed"})
	}

	return c.Status(fiber.StatusCreated).JSON(b)
}

// send one event (any struct, as JSON) to a RabbitMQ queue
func (h *BookingHandler) publishEvent(ctx context.Context, queue string, event any) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	return h.RabbitChannel.PublishWithContext(
		ctx,
		"",    // default exchange: the routing key is the queue name
		queue, // e.g. "booking.created"
		false,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent, // to store on disk
			Body:         payload,
		},
	)
}

// after an admin confirmed/rejected a booking: tell the notification service.
// The status change is already saved, so a failure here is only logged (the admin's request still succeeds)
func (h *BookingHandler) publishBookingReviewed(ctx context.Context, b Booking) {
	d, err := h.Repo.GetBookingByID(ctx, b.ID)
	if err == nil {
		err = h.publishEvent(ctx, "booking.reviewed", BookingReviewedEvent{
			BookingID:   d.ID,
			UserID:      d.UserID,
			ServiceName: d.ServiceName,
			BookingDate: d.BookingDate,
			Status:      d.Status,
		})
	}
	if err != nil {
		log.Println("booking.reviewed: could not publish for booking", b.ID, ":", err)
	}
}

// after a user cancelled their booking: tell the notification service, so every admin gets a notification.
// The cancel is already saved, so a failure here is only logged (the user's request still succeeds)
func (h *BookingHandler) publishBookingCancelled(ctx context.Context, b Booking) {
	d, err := h.Repo.GetBookingByID(ctx, b.ID)
	if err == nil {
		err = h.publishEvent(ctx, "booking.cancelled", BookingCancelledEvent{
			BookingID:   d.ID,
			UserID:      d.UserID,
			Username:    d.Username,
			ServiceName: d.ServiceName,
			BookingDate: d.BookingDate,
		})
	}
	if err != nil {
		log.Println("booking.cancelled: could not publish for booking", b.ID, ":", err)
	}
}

// GetBookings godoc
// @Summary      List all bookings (admin table)
// @Description  One page of bookings with user and service names. All filters combine with AND. Admin only.
// @Tags         bookings
// @Produce      json
// @Param        page      query  int     false  "Page number"               default(1)
// @Param        limit     query  int     false  "Rows per page (max 100)"   default(10)
// @Param        sort      query  string  false  "Sort column"   Enums(booking_date, status, created_at, username, service_name)
// @Param        order     query  string  false  "Sort direction"  Enums(asc, desc)
// @Param        status    query  string  false  "Comma-separated statuses (pending, confirmed, cancelled, rejected), e.g. pending,confirmed"
// @Param        date      query  string  false  "Only this date (YYYY-MM-DD)"
// @Param        username  query  string  false  "Search in the user's name"
// @Param        service   query  string  false  "Search in the service's name"
// @Success      200  {object}  AdminBookingPage
// @Failure      400  {object}  ErrorResponse  "date is not YYYY-MM-DD"
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      403  {object}  ErrorResponse  "not an admin"
// @Failure      500  {object}  ErrorResponse
// @Router       /bookings [get]
func (h *BookingHandler) GetBookings(c fiber.Ctx) error {
	// pagination
	page, limit := parsePageLimit(c)

	// sort whitelist
	sortColumns := map[string]string{
		"booking_date": "b.booking_date",
		"status":       "b.status",
		"created_at":   "b.created_at",
		"username":     "u.username",
		"service_name": "s.name",
	}

	sortCol, ok := sortColumns[c.Query("sort")]
	if !ok {
		sortCol = "b.id"
	}

	order := strings.ToLower(c.Query("order"))
	if order != "asc" && order != "desc" {
		order = "asc"
	}

	// status filter: ?status=pending,confirmed
	statuses := parseStatuses(c)

	// date filter: ?date=2026-11-20
	var date *time.Time // nil = no filter
	if d := c.Query("date"); d != "" {
		parsed, err := time.Parse("2006-01-02", d)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "date must be YYYY-MM-DD"})
		}
		date = &parsed // & = "the address of": now date points to parsed
	}

	list, total, err := h.Repo.GetBookingsPage(BookingFilter{
		Page:        page,
		Limit:       limit,
		Sort:        sortCol,
		Order:       order,
		Statuses:    statuses,
		Date:        date,
		Username:    strings.TrimSpace(c.Query("username")),
		ServiceName: strings.TrimSpace(c.Query("service")),
	})

	if err != nil {
		log.Println("GetBookingsPage:", err) // TEMP: print the real SQL error in the terminal
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	return c.JSON(AdminBookingPage{Data: list, Total: total, Page: page, Limit: limit})
}

// GetMyBookings godoc
// @Summary      List my bookings (My Bookings table)
// @Description  One page of the logged-in user's bookings, with the service name. Default order: booking date, newest first.
// @Tags         bookings
// @Produce      json
// @Param        page    query  int     false  "Page number"              default(1)
// @Param        limit   query  int     false  "Rows per page (max 100)"  default(10)
// @Param        sort    query  string  false  "Sort column"  Enums(booking_date, service_name, status, created_at)
// @Param        order   query  string  false  "Sort direction"  Enums(asc, desc)
// @Param        status  query  string  false  "Comma-separated statuses (pending, confirmed, cancelled, rejected)"
// @Success      200  {object}  MyBookingPage
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      500  {object}  ErrorResponse
// @Router       /bookings/me [get]
func (h *BookingHandler) GetMyBookings(c fiber.Ctx) error {
	userID := c.Locals("userId").(int64)

	page, limit := parsePageLimit(c)

	// sort whitelist: only these columns can ever reach the SQL
	sortColumns := map[string]string{
		"booking_date": "b.booking_date",
		"service_name": "s.name",
		"status":       "b.status",
		"created_at":   "b.created_at",
	}

	// default: booking date, newest first
	sortCol, ok := sortColumns[c.Query("sort")]
	order := strings.ToLower(c.Query("order"))
	if !ok {
		sortCol = "b.booking_date"
		order = "desc"
	}
	if order != "asc" && order != "desc" {
		order = "desc"
	}

	list, total, err := h.Repo.GetMyBookingsPage(c.Context(), userID, BookingFilter{
		Page:     page,
		Limit:    limit,
		Sort:     sortCol,
		Order:    order,
		Statuses: parseStatuses(c),
	})
	if err != nil {
		log.Println("GetMyBookingsPage:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.JSON(MyBookingPage{Data: list, Total: total, Page: page, Limit: limit})
}

// ?page=2&limit=25 → (2, 25). Bad or missing values fall back to page 1 and 10 rows; max 100 rows
func parsePageLimit(c fiber.Ctx) (int, int) {
	page, err := strconv.Atoi(c.Query("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(c.Query("limit", "10"))
	if err != nil || limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	return page, limit
}

// ?status=pending,rejected → ["pending", "rejected"]. Unknown values are dropped (whitelist)
func parseStatuses(c fiber.Ctx) []string {
	allowed := map[string]bool{"pending": true, "confirmed": true, "cancelled": true, "rejected": true}

	statuses := []string{}
	for _, s := range strings.Split(c.Query("status"), ",") {
		s = strings.TrimSpace(s)
		if allowed[s] {
			statuses = append(statuses, s)
		}
	}
	return statuses
}

// GetBookingByID godoc
// @Summary      One booking (detail page)
// @Description  A booking with the user's and service's names. Admins can see any booking; a user only their own (otherwise 404, so we don't reveal that it exists).
// @Tags         bookings
// @Produce      json
// @Param        id   path      int  true  "Booking id"
// @Success      200  {object}  BookingDetail
// @Failure      400  {object}  ErrorResponse  "invalid booking id"
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      404  {object}  ErrorResponse  "not found (or not yours)"
// @Router       /bookings/{id} [get]
func (h *BookingHandler) GetBookingByID(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid booking id"})
	}

	d, err := h.Repo.GetBookingByID(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// a normal user may only see their own booking.
	// 404 instead of 403: a 403 would tell them "this booking exists"
	userID := c.Locals("userId").(int64)
	role, _ := c.Locals("role").(string)
	if role != "admin" && d.UserID != userID {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": ErrNotFound.Error()})
	}

	return c.JSON(d)
}

// ConfirmBooking godoc
// @Summary      Approve a booking (admin)
// @Description  pending → confirmed. Admin only. Any other status gives 409.
// @Tags         bookings
// @Produce      json
// @Param        id   path      int  true  "Booking id"
// @Success      200  {object}  Booking
// @Failure      400  {object}  ErrorResponse  "invalid booking id"
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      403  {object}  ErrorResponse  "not an admin"
// @Failure      409  {object}  ErrorResponse  "not found or not pending"
// @Router       /bookings/{id}/confirm [post]
func (h *BookingHandler) ConfirmBooking(c fiber.Ctx) error {
	// get :id from url and convert string -> int64
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid booking id"})
	}

	b, err := h.Repo.ConfirmBooking(c.Context(), id)
	if errors.Is(err, ErrNotAllowed) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	h.publishBookingReviewed(c.Context(), b) // → "Booking approved" for the user

	return c.JSON(b)
}

// RejectBooking godoc
// @Summary      Reject a booking (admin)
// @Description  pending → rejected. Admin only. Any other status gives 409. A rejected booking frees the date.
// @Tags         bookings
// @Produce      json
// @Param        id   path      int  true  "Booking id"
// @Success      200  {object}  Booking
// @Failure      400  {object}  ErrorResponse  "invalid booking id"
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      403  {object}  ErrorResponse  "not an admin"
// @Failure      409  {object}  ErrorResponse  "not found or not pending"
// @Router       /bookings/{id}/reject [post]
func (h *BookingHandler) RejectBooking(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid booking id"})
	}

	b, err := h.Repo.RejectBooking(c.Context(), id)
	if errors.Is(err, ErrNotAllowed) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	h.publishBookingReviewed(c.Context(), b) // → "Booking rejected" for the user

	return c.JSON(b)
}

// CancelBooking godoc
// @Summary      Cancel my booking
// @Description  pending → cancelled. Only the owner, and only while pending. Confirmed, rejected or someone else's booking gives 409.
// @Tags         bookings
// @Produce      json
// @Param        id   path      int  true  "Booking id"
// @Success      200  {object}  Booking
// @Failure      400  {object}  ErrorResponse  "invalid booking id"
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      409  {object}  ErrorResponse  "not found, not yours, or not pending"
// @Router       /bookings/{id}/cancel [post]
func (h *BookingHandler) CancelBooking(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid booking id"})
	}

	userID := c.Locals("userId").(int64)

	b, err := h.Repo.CancelBooking(c.Context(), id, userID)
	if errors.Is(err, ErrNotAllowed) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	// only reached when the cancel really happened (409/500 returned above)
	h.publishBookingCancelled(c.Context(), b) // → "Booking cancelled" for every admin

	return c.JSON(b)
}

func (h *BookingHandler) GetAvailability(c fiber.Ctx) error {
	// ?date=2026-11-20
	date, err := time.Parse("2006-01-02", c.Query("date"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "date must be YYYY-MM-DD"})
	}

	ids, err := h.Repo.GetBookedServiceIDs(date)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	return c.JSON(fiber.Map{"booked_service_ids": ids})
}
