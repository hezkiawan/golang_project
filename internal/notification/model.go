package notification

// from the "booking.created" queue (same JSON as BookingCreatedEvent in internal/booking/model.go)
type BookingCreatedEvent struct {
	BookingID   int64  `json:"booking_id"`
	ServiceID   int64  `json:"service_id"`
	UserID      int64  `json:"user_id"`
	Username    string `json:"username"`
	ServiceName string `json:"service_name"`
	BookingDate string `json:"booking_date"`
}

// from the "booking.reviewed" queue (same JSON as BookingReviewedEvent in internal/booking/model.go)
type BookingReviewedEvent struct {
	BookingID   int64  `json:"booking_id"`
	UserID      int64  `json:"user_id"`
	ServiceName string `json:"service_name"`
	BookingDate string `json:"booking_date"`
	Status      string `json:"status"` // "confirmed" or "rejected"
}
