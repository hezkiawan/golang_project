package main

import (
	"context"
	"log"
	"os"

	"golang-microservice-practice/internal/middleware"
	"golang-microservice-practice/internal/notification"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	amqp "github.com/rabbitmq/amqp091-go"
)

func main() {

	// notif butu verify jwt
	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env: ", err)
	}

	secret := []byte(os.Getenv("JWT_SECRET"))

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

	consumer := notification.Consumer{
		Channel: channel,
		Repo:    repo, // was: DB: pool
	}

	go consumer.Start()

	// fiber server for endpoint
	app := fiber.New()

	app.Use(middleware.SlowDown())

	handler := notification.NotificationHandler{
		Repo: repo, // the SAME repository the consumer uses
	}

	notification.NotificationRoutes(
		app,
		&handler,
		secret,
	)

	log.Fatal(
		app.Listen(":3004"),
	)

}
