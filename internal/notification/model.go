package notification

import "time"

type BookingCreatedEvent struct {
	BookingID   int64  `json:"booking_id"`
	ServiceID   int64  `json:"service_id"`
	ServiceName string `json:"service_name"`
	UserID      int64  `json:"user_id"`
	UserEmail   string `json:"user_email"`
	Username    string `json:"username"`
}

type Notification struct {
	ID        int64     `json:"id"`
	BookingID int64     `json:"booking_id"`
	ServiceID int64     `json:"service_id"`
	UserID    int64     `json:"user_id"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}
