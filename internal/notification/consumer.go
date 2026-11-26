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
	Repo      *NotificationRepository // only to look up the admin ids
	Firestore *FirestoreStore
}

// own error type - a message we can never handle (bad JSON). Retrying won't help, so we drop it
var errBadMessage = errors.New("bad message")

// start the queue listeners (each one runs in its own goroutine)
func (c *Consumer) Start() {
	go c.consume("booking.created", c.handleBookingCreated)
	go c.consume("booking.reviewed", c.handleBookingReviewed)
	go c.consume("booking.cancelled", c.handleBookingCancelled)
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

// booking.created → Firestore: one notification per admin
func (c *Consumer) handleBookingCreated(ctx context.Context, body []byte) error {
	var event BookingCreatedEvent
	if err := json.Unmarshal(body, &event); err != nil {
		return fmt.Errorf("%w: %v", errBadMessage, err)
	}

	adminIDs, err := c.Repo.GetAdminIDs(ctx)
	if err != nil {
		return err
	}

	// safe to repeat: fixed doc ids, so a redelivered message makes no duplicates
	if err := c.Firestore.NotifyAdminsBookingCreated(ctx, adminIDs, event); err != nil {
		return err
	}

	log.Println("booking.created: booking", event.BookingID, "by", event.Username, "→ notified", len(adminIDs), "admin(s)")
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

// booking.cancelled → Firestore: one notification per admin
func (c *Consumer) handleBookingCancelled(ctx context.Context, body []byte) error {
	var event BookingCancelledEvent
	if err := json.Unmarshal(body, &event); err != nil {
		return fmt.Errorf("%w: %v", errBadMessage, err)
	}

	adminIDs, err := c.Repo.GetAdminIDs(ctx)
	if err != nil {
		return err
	}

	// safe to repeat: fixed doc ids, so a redelivered message makes no duplicates
	if err := c.Firestore.NotifyAdminsBookingCancelled(ctx, adminIDs, event); err != nil {
		return err
	}

	log.Println("booking.cancelled: booking", event.BookingID, "by", event.Username, "→ notified", len(adminIDs), "admin(s)")
	return nil
}
