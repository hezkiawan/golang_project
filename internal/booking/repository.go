package booking

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// what the admin table asks for (already validated by the handler)
type BookingFilter struct {
	Page        int
	Limit       int
	Sort        string     // a whitelisted SQL column
	Order       string     // "asc" or "desc"
	Statuses    []string   // whitelisted statuses, empty = all
	Date        *time.Time // nil = any date
	Username    string     // search in the user's name ("" = no search)
	ServiceName string     // search in the service's name ("" = no search)
}

// the columns every booking query selects. booking_date::text → "2026-11-20" as a string
const bookingColumns = "id, service_id, user_id, booking_date::text, status, created_at"

type BookingRepository struct {
	DB *pgxpool.Pool
}

func NewBookingRepository(db *pgxpool.Pool) *BookingRepository {
	return &BookingRepository{
		DB: db,
	}
}

// custom error buat handler
var ErrAlreadyBooked = errors.New("this service is already booked on that date")
var ErrNotAllowed = errors.New("booking not found or this status change is not allowed")
var ErrNotFound = errors.New("booking not found")

// the FROM + JOINs, shared by the COUNT and the page query
const adminBookingsFrom = `
	FROM bookings b
	LEFT JOIN users u ON u.id = b.user_id
	LEFT JOIN services s ON s.id = b.service_id`

// one page of bookings + the total that match the filter
func (r *BookingRepository) GetBookingsPage(f BookingFilter) ([]AdminBooking, int, error) {
	conditions := []string{}
	args := []any{}

	if len(f.Statuses) > 0 {
		args = append(args, f.Statuses)
		conditions = append(conditions, fmt.Sprintf("status = ANY($%d)", len(args)))
	}
	if f.Date != nil {
		args = append(args, *f.Date) // *f.Date = the actual time value the pointer points to
		conditions = append(conditions, fmt.Sprintf("booking_date = $%d", len(args)))
	}

	// search by names from the joined tables
	if f.Username != "" {
		args = append(args, "%"+f.Username+"%")
		conditions = append(conditions, fmt.Sprintf("u.username ILIKE $%d", len(args)))
	}
	if f.ServiceName != "" {
		args = append(args, "%"+f.ServiceName+"%")
		conditions = append(conditions, fmt.Sprintf("s.name ILIKE $%d", len(args)))
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	// total of matching bookings
	var total int
	if err := r.DB.QueryRow(context.Background(), "SELECT COUNT(*) "+adminBookingsFrom+" "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// one page of them
	query := fmt.Sprintf(`
		SELECT b.id, b.user_id, COALESCE(u.username, '(deleted user)'),
		       b.service_id, COALESCE(s.name, '(deleted service)'),
		       b.booking_date::text, b.status
		%s %s
		ORDER BY %s %s, b.id ASC
		LIMIT $%d OFFSET $%d`,
		adminBookingsFrom, where, f.Sort, f.Order, len(args)+1, len(args)+2)

	rows, err := r.DB.Query(context.Background(), query, append(args, f.Limit, (f.Page-1)*f.Limit)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := []AdminBooking{}
	for rows.Next() {
		var a AdminBooking
		if err := rows.Scan(&a.ID, &a.UserID, &a.Username, &a.ServiceID, &a.ServiceName, &a.BookingDate, &a.Status); err != nil {
			return nil, 0, err
		}
		list = append(list, a)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return list, total, nil
}

func (r *BookingRepository) GetBookings() ([]Booking, error) {
	rows, err := r.DB.Query(context.Background(),
		"SELECT id, service_id, user_id, booking_date::text, status, created_at FROM bookings ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	bookingList := []Booking{}
	for rows.Next() {
		var b Booking
		if err := rows.Scan(&b.ID, &b.ServiceID, &b.UserID, &b.BookingDate, &b.Status, &b.CreatedAt); err != nil {
			return nil, err
		}
		bookingList = append(bookingList, b)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return bookingList, nil
}

// get only the bookings of one user (for "my bookings" page)
func (r *BookingRepository) GetBookingsByUser(userId int64) ([]Booking, error) {
	rows, err := r.DB.Query(context.Background(),
		// LEFT JOIN: the name comes from the services table, even when the service is soft-deleted
		`SELECT b.id, b.service_id, b.user_id, b.booking_date::text, b.status, b.created_at, COALESCE(s.name, '')
		FROM bookings b
		LEFT JOIN services s ON s.id = b.service_id
		WHERE b.user_id = $1
		ORDER BY b.booking_date`,
		userId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	bookingList := []Booking{}
	for rows.Next() {
		var b Booking
		if err := rows.Scan(&b.ID, &b.ServiceID, &b.UserID, &b.BookingDate, &b.Status, &b.CreatedAt, &b.ServiceName); err != nil {
			return nil, err
		}
		bookingList = append(bookingList, b)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return bookingList, nil
}

func (r *BookingRepository) CreateBooking(serviceId int64, userId int64, date time.Time) (Booking, error) {
	var b Booking

	err := r.DB.QueryRow(context.Background(),
		"INSERT INTO bookings (service_id, user_id, booking_date) VALUES ($1, $2, $3) RETURNING id, service_id, user_id, booking_date::text, status, created_at",
		serviceId, userId, date,
	).Scan(&b.ID, &b.ServiceID, &b.UserID, &b.BookingDate, &b.Status, &b.CreatedAt)

	// if the unique index rejected the insert, postgres returns error code 23505 (unique_violation)
	// errors.As checks "is this error a postgres error?" and if yes puts it into pgErr so we can read the code
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return b, ErrAlreadyBooked
	}

	return b, err
}

// pending -> confirmed. Admin only (checked in routes.go), so any user's booking can be confirmed
func (r *BookingRepository) ConfirmBooking(ctx context.Context, id int64) (Booking, error) {
	var b Booking

	err := r.DB.QueryRow(ctx,
		"UPDATE bookings SET status = 'confirmed' WHERE id = $1 AND status = 'pending' RETURNING "+bookingColumns,
		id,
	).Scan(&b.ID, &b.ServiceID, &b.UserID, &b.BookingDate, &b.Status, &b.CreatedAt)

	// ga ada row berarti WHERE didn't match / not found or not pending
	if errors.Is(err, pgx.ErrNoRows) {
		return b, ErrNotAllowed
	}

	return b, err
}

// pending -> rejected. Admin only (checked in routes.go)
func (r *BookingRepository) RejectBooking(ctx context.Context, id int64) (Booking, error) {
	var b Booking

	err := r.DB.QueryRow(ctx,
		"UPDATE bookings SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING "+bookingColumns,
		id,
	).Scan(&b.ID, &b.ServiceID, &b.UserID, &b.BookingDate, &b.Status, &b.CreatedAt)

	// no row: not found, or already confirmed/cancelled/rejected
	if errors.Is(err, pgx.ErrNoRows) {
		return b, ErrNotAllowed
	}

	return b, err
}

// pending -> cancelled. Only the owner, and only while it is still pending
// (once an admin confirmed it, the user can't cancel it anymore)
func (r *BookingRepository) CancelBooking(ctx context.Context, id int64, userId int64) (Booking, error) {
	var b Booking

	err := r.DB.QueryRow(ctx,
		"UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING "+bookingColumns,
		id, userId,
	).Scan(&b.ID, &b.ServiceID, &b.UserID, &b.BookingDate, &b.Status, &b.CreatedAt)

	// no row: not found, not yours, or not pending anymore
	if errors.Is(err, pgx.ErrNoRows) {
		return b, ErrNotAllowed
	}

	return b, err
}

// one booking with the user's and service's names (same JOIN as the admin table)
func (r *BookingRepository) GetBookingByID(ctx context.Context, id int64) (BookingDetail, error) {
	var d BookingDetail

	err := r.DB.QueryRow(ctx,
		`SELECT b.id, b.user_id, COALESCE(u.username, '(deleted user)'),
		        b.service_id, COALESCE(s.name, '(deleted service)'),
		        b.booking_date::text, b.status, b.created_at
		`+adminBookingsFrom+`
		WHERE b.id = $1`,
		id,
	).Scan(&d.ID, &d.UserID, &d.Username, &d.ServiceID, &d.ServiceName, &d.BookingDate, &d.Status, &d.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNotFound
	}

	return d, err
}

// returns ids of services that already have an active booking on this date
func (r *BookingRepository) GetBookedServiceIDs(date time.Time) ([]int64, error) {
	rows, err := r.DB.Query(context.Background(),
		"SELECT service_id FROM bookings WHERE booking_date = $1 AND status IN ('pending', 'confirmed')",
		date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return ids, nil
}
