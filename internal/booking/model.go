package booking

import "time"

type Booking struct {
	ID          int64     `json:"id"`
	ServiceID   int64     `json:"service_id"`
	UserID      int64     `json:"user_id"`
	BookingDate string    `json:"booking_date"` // "2026-11-05" date dijadiin string dari postgres
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	// only filled by GetBookingsByUser (JOIN on services), so a deleted service still shows its name.
	// omitempty: other responses (create, confirm, cancel) just leave it out
	ServiceName string `json:"service_name,omitempty"`
}

type AdminBooking struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"user_id"`
	Username    string `json:"username"`
	ServiceID   int64  `json:"service_id"`
	ServiceName string `json:"service_name"`
	BookingDate string `json:"booking_date"`
	Status      string `json:"status"`
}

type BookingRequest struct {
	ServiceID   int64  `json:"service_id"`
	BookingDate string `json:"booking_date"` // client sends "YYYY-MM-DD"
}

type BookingCreatedEvent struct {
	BookingID int64 `json:"booking_id"`
	ServiceID int64 `json:"service_id"`
	UserID    int64 `json:"user_id"`
}

// error body returned by the handlers
type ErrorResponse struct {
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

// one page of the admin bookings table
type AdminBookingPage struct {
	Data  []AdminBooking `json:"data"`
	Total int            `json:"total"`
	Page  int            `json:"page"`
	Limit int            `json:"limit"`
}
