package notification

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Consumer struct {
	Channel *amqp.Channel
	Repo    *NotificationRepository
}

func (c *Consumer) Start() {

	// consume the messages from that queue
	msgs, err := c.Channel.Consume(
		"booking.created",
		"",
		false,
		false,
		false,
		false,
		nil,
	)

	if err != nil {
		log.Fatal(err)
	}

	log.Println("Waiting for booking created")

	for msg := range msgs {

		var event BookingCreatedEvent

		if err := json.Unmarshal(msg.Body, &event); err != nil {
			log.Println(err)
			continue
		}

		message := fmt.Sprintf(
			"Notification for booking %d created for %s (service id = %d)",
			event.BookingID,
			event.Username,
			event.ServiceID,
		)

		// save the notification through the repository
		err := c.Repo.Create(context.Background(), event.BookingID, event.ServiceID, event.UserID, message)
		if err != nil {
			log.Println(err)
			continue // no Ack -> RabbitMQ keeps the message
		}

		log.Println(message)

		// Ack means done processing the message so that message will be deleted from the queue
		if err := msg.Ack(false); err != nil {
			log.Println(err)
		}

	}

}
