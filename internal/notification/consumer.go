package notification

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Consumer struct {
	Channel   *amqp.Channel
	Repo      *NotificationRepository
	Firestore *FirestoreStore
}

// a message we can never handle (bad JSON). Retrying won't help, so we drop it
var errBadMessage = errors.New("bad message")

// start both queue listeners (each one runs in its own goroutine)
func (c *Consumer) Start() {
	go c.consume("booking.created", c.handleBookingCreated)
	go c.consume("booking.reviewed", c.handleBookingReviewed)
}

// read messages from one queue forever and call handle for each one
func (c *Consumer) consume(queue string, handle func(ctx context.Context, body []byte) error) {
	msgs, err := c.Channel.Consume(
		queue,
		"",    // consumer tag: let RabbitMQ pick one
		false, // autoAck off: we ack ourselves after the work is saved
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		log.Fatal(err)
	}

	log.Println("Waiting for", queue)

	for msg := range msgs {
		err := handle(context.Background(), msg.Body)

		if errors.Is(err, errBadMessage) {
			// broken message: log it and drop it (Nack without requeue), otherwise it would come back forever
			log.Println(queue, "dropped:", err, string(msg.Body))
			if err := msg.Nack(false, false); err != nil {
				log.Println(err)
			}
			continue
		}
		if err != nil {
			// temporary problem (Firestore or Postgres down, wrong credentials...):
			// no Ack -> RabbitMQ keeps the message and delivers it again after a restart
			log.Println(queue, "failed, will retry later:", err)
			continue
		}

		// Ack means done processing the message so that message will be deleted from the queue
		if err := msg.Ack(false); err != nil {
			log.Println(err)
		}
	}
}

// booking.created → Firestore: one notification per admin; Postgres: the old row (until M4)
func (c *Consumer) handleBookingCreated(ctx context.Context, body []byte) error {
	var event BookingCreatedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		return fmt.Errorf("%w: %v", errBadMessage, err)
	}

	adminIDs, err := c.Repo.GetAdminIDs(ctx)
	if err != nil {
		return err
	}

	// Firestore first: it is safe to repeat (fixed doc ids), the Postgres insert is not
	if err := c.Firestore.NotifyAdminsBookingCreated(ctx, adminIDs, event); err != nil {
		return err
	}

	message := fmt.Sprintf("%s booked %s for %s (booking %d)", event.Username, event.ServiceName, event.BookingDate, event.BookingID)
	if err := c.Repo.Create(ctx, event.BookingID, event.ServiceID, event.UserID, message); err != nil {
		return err
	}

	log.Println("booking.created:", message, "→ notified", len(adminIDs), "admin(s)")
	return nil
}

// booking.reviewed → Firestore: one notification for the booking's user
func (c *Consumer) handleBookingReviewed(ctx context.Context, body []byte) error {
	var event BookingReviewedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		return fmt.Errorf("%w: %v", errBadMessage, err)
	}

	if err := c.Firestore.NotifyUserBookingReviewed(ctx, event); err != nil {
		return err
	}

	log.Println("booking.reviewed: booking", event.BookingID, "is", event.Status, "→ notified user", event.UserID)
	return nil
}
