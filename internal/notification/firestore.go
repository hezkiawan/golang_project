package notification

import (
	"context"
	"fmt"
	"strconv"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// writes notification documents to Firestore: notifications/{id}
// The frontend (M4) reads them live with onSnapshot.
type FirestoreStore struct {
	Client *firestore.Client
}

// one document, the fields the frontend expects
func newNotificationDoc(recipientID int64, kind string, bookingID int64, title string, body string) map[string]any {
	return map[string]any{
		"recipientId": strconv.FormatInt(recipientID, 10), // a string, so it matches request.auth.uid in the rules
		"type":        kind,                                // "booking_created" | "booking_reviewed"
		"bookingId":   bookingID,
		"title":       title,
		"body":        body,
		"read":        false,
		"createdAt":   firestore.ServerTimestamp, // Firestore fills in its own clock
	}
}

// create the document with a FIXED id. Create (not Set) fails with AlreadyExists if it is
// already there: that happens when RabbitMQ redelivers a message we already handled.
// We treat that as success, so a retry never makes a duplicate or resets "read" to false.
func (s *FirestoreStore) createOnce(ctx context.Context, docID string, doc map[string]any) error {
	_, err := s.Client.Collection("notifications").Doc(docID).Create(ctx, doc)
	if status.Code(err) == codes.AlreadyExists {
		return nil
	}
	return err
}

// "booking.created" → one document per admin (each admin has their own read/unread state)
func (s *FirestoreStore) NotifyAdminsBookingCreated(ctx context.Context, adminIDs []int64, e BookingCreatedEvent) error {
	body := fmt.Sprintf("%s booked %s for %s", e.Username, e.ServiceName, e.BookingDate)

	// one by one: if one write fails we return the error, the message is not acked,
	// and on the retry the admins that already got it are skipped by createOnce
	for _, adminID := range adminIDs {
		docID := fmt.Sprintf("booking_created_%d_%d", e.BookingID, adminID)
		doc := newNotificationDoc(adminID, "booking_created", e.BookingID, "New booking", body)
		if err := s.createOnce(ctx, docID, doc); err != nil {
			return err
		}
	}
	return nil
}

// "booking.reviewed" → one document for the user who made the booking.
// A booking can only be reviewed once (it must be pending), so the booking id alone is a unique doc id.
func (s *FirestoreStore) NotifyUserBookingReviewed(ctx context.Context, e BookingReviewedEvent) error {
	title := "Booking approved"
	word := "approved"
	if e.Status == "rejected" {
		title = "Booking rejected"
		word = "rejected"
	}
	body := fmt.Sprintf("Your booking for %s on %s was %s.", e.ServiceName, e.BookingDate, word)

	docID := fmt.Sprintf("booking_reviewed_%d", e.BookingID)
	doc := newNotificationDoc(e.UserID, "booking_reviewed", e.BookingID, title, body)
	return s.createOnce(ctx, docID, doc)
}
