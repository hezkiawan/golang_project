package booking

import "time"

type Booking struct {
	ID          int64     `json:"id"`
	ServiceID   int64     `json:"service_id"`
	UserID      int64     `json:"user_id"`
	BookingDate string    `json:"booking_date"` // "2026-11-05" date dijadiin string dari postgres
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	// only filled by GetMyBookingsPage (JOIN on services), so a deleted service still shows its name.
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

// GET /bookings/:id: one booking with the names, for the detail page
type BookingDetail struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	Username    string    `json:"username"`
	ServiceID   int64     `json:"service_id"`
	ServiceName string    `json:"service_name"`
	BookingDate string    `json:"booking_date"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

type BookingRequest struct {
	ServiceID   int64  `json:"service_id"`
	BookingDate string `json:"booking_date"` // client sends "YYYY-MM-DD"
}

// sent on the "booking.created" queue. It carries the names too,
// so the notification service can write "hezki booked AC Repair for 2026-11-25" without extra queries
type BookingCreatedEvent struct {
	BookingID   int64  `json:"booking_id"`
	ServiceID   int64  `json:"service_id"`
	UserID      int64  `json:"user_id"`
	Username    string `json:"username"`
	ServiceName string `json:"service_name"`
	BookingDate string `json:"booking_date"`
}

// sent on the "booking.reviewed" queue when an admin confirms or rejects a booking
type BookingReviewedEvent struct {
	BookingID   int64  `json:"booking_id"`
	UserID      int64  `json:"user_id"` // who gets the notification
	ServiceName string `json:"service_name"`
	BookingDate string `json:"booking_date"`
	Status      string `json:"status"` // "confirmed" or "rejected"
}

// sent on the "booking.cancelled" queue when a user cancels their own pending booking.
// It carries the names, so the admins' notification can say who cancelled what
type BookingCancelledEvent struct {
	BookingID   int64  `json:"booking_id"`
	UserID      int64  `json:"user_id"`
	Username    string `json:"username"`
	ServiceName string `json:"service_name"`
	BookingDate string `json:"booking_date"`
}

// error body returned by the handlers
type ErrorResponse struct {
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

// one page of the admin bookings table
// GET /bookings/me: one page of my bookings
type MyBookingPage struct {
	Data  []Booking `json:"data"`
	Total int       `json:"total"`
	Page  int       `json:"page"`
	Limit int       `json:"limit"`
}

type AdminBookingPage struct {
	Data  []AdminBooking `json:"data"`
	Total int            `json:"total"`
	Page  int            `json:"page"`
	Limit int            `json:"limit"`
}
