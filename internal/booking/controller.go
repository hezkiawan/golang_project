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

	// payload for event
	payload, err := json.Marshal(BookingCreatedEvent{
		BookingID: b.ID,
		ServiceID: b.ServiceID,
		UserID:    b.UserID,
	})

	// RABBIT MQ - PUB SUB
	// we need to publish only after the row is saved
	err = h.RabbitChannel.PublishWithContext(
		context.Background(),
		"",
		"booking.created",
		false,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent, // to store on disk
			Body:         payload,
		},
	)

	if err != nil {
		log.Println(err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "event publish failed"})
	}

	return c.Status(fiber.StatusCreated).JSON(b)
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
// @Param        status    query  string  false  "Comma-separated statuses, e.g. pending,confirmed"
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
	statuses := []string{}
	allowed := map[string]bool{"pending": true, "confirmed": true, "cancelled": true}
	for _, s := range strings.Split(c.Query("status"), ",") {
		s = strings.TrimSpace(s)
		if allowed[s] {
			statuses = append(statuses, s)
		}
	}

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

func (h *BookingHandler) GetMyBookings(c fiber.Ctx) error {
	userID := c.Locals("userId").(int64)

	bookingList, err := h.Repo.GetBookingsByUser(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	return c.JSON(bookingList)
}

func (h *BookingHandler) ConfirmBooking(c fiber.Ctx) error {
	// get :id from url and convert string -> int64
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid booking id"})
	}

	userID := c.Locals("userId").(int64)

	b, err := h.Repo.ConfirmBooking(id, userID)
	if errors.Is(err, ErrNotAllowed) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	return c.JSON(b)
}

func (h *BookingHandler) CancelBooking(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid booking id"})
	}

	userID := c.Locals("userId").(int64)

	b, err := h.Repo.CancelBooking(id, userID)
	if errors.Is(err, ErrNotAllowed) {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

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
