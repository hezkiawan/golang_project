package main

import (
	"context"
	"log"
	"os"

	"golang-microservice-practice/internal/notification"

	firebase "firebase.google.com/go/v4"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	amqp "github.com/rabbitmq/amqp091-go"
)

func main() {

	// .env holds the Firebase settings (GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_PROJECT_ID)
	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env: ", err)
	}

	// create postgres connection

	pool, err := pgxpool.New(
		context.Background(),
		"postgres://homefix:homefix@localhost:5435/homefix?sslmode=disable",
	)

	if err != nil {
		log.Fatal(err)
	}

	defer pool.Close()
	if err := pool.Ping(context.Background()); err != nil {
		log.Fatal(err)
	}

	repo := notification.NewNotificationRepository(pool)

	// create the amqp connection
	amqpConn, err := amqp.Dial(
		"amqp://homefix:homefix@localhost:5672/",
	)

	if err != nil {
		log.Fatal(err)
	}

	defer amqpConn.Close()

	// create amqp channel

	channel, err := amqpConn.Channel()

	if err != nil {
		log.Fatal(err)
	}

	defer channel.Close()

	// for the consumer we must declare the queue too same with producer

	_, err = channel.QueueDeclare(
		"booking.created",
		true,
		false,
		false,
		false,
		nil,
	)

	if err != nil {
		log.Fatal(err)
	}

	// second queue: an admin confirmed or rejected a booking
	_, err = channel.QueueDeclare(
		"booking.reviewed",
		true,
		false,
		false,
		false,
		nil,
	)

	if err != nil {
		log.Fatal(err)
	}

	// FIREBASE: the Admin SDK reads the service-account key from GOOGLE_APPLICATION_CREDENTIALS (set in .env).
	// FIREBASE_PROJECT_ID makes the project explicit; if it is empty the SDK takes it from the key file
	firebaseApp, err := firebase.NewApp(context.Background(), &firebase.Config{
		ProjectID: os.Getenv("FIREBASE_PROJECT_ID"),
	})
	if err != nil {
		log.Fatal("firebase init: ", err)
	}

	firestoreClient, err := firebaseApp.Firestore(context.Background())
	if err != nil {
		log.Fatal("firestore init: ", err)
	}
	defer firestoreClient.Close()

	consumer := notification.Consumer{
		Channel:   channel,
		Repo:      repo, // was: DB: pool
		Firestore: &notification.FirestoreStore{Client: firestoreClient},
	}

	// starts one listener per queue in the background
	consumer.Start()

	// No HTTP endpoints any more (M4): the frontend reads notifications straight from Firestore.
	// The listeners run in goroutines, so block here forever to keep the process alive.
	log.Println("notification service: listening to RabbitMQ")
	select {}
}
