package main

import (
	"context"
	"golang-microservice-practice/internal/booking"
	"golang-microservice-practice/internal/middleware"
	catalogpb "golang-microservice-practice/proto"
	"log"
	"os"

	_ "golang-microservice-practice/docs/booking" // registers the generated spec (the _ means "import only for its side effect")

	"github.com/gofiber/contrib/v3/swaggo"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// @title           HomeFix Booking Service API
// @version         1.0
// @description     Bookings: create, confirm/cancel, availability and the admin bookings table.
// @description     Auth: log in at POST /auth/login (user service). The browser then sends the jwt cookie automatically.
// @host            localhost:3001
// @BasePath        /

func main() {
	//load .env
	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env", err)
	}

	// database conn
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

	// create the grpc client connection
	conn, err := grpc.NewClient(
		"localhost:50051",
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)

	if err != nil {
		log.Fatal(err)
	}

	defer conn.Close()

	// create the grpc client
	catalog := catalogpb.NewCatalogServiceClient(conn)

	// create amqp connection
	amqpConn, err := amqp.Dial("amqp://homefix:homefix@localhost:5672/")

	if err != nil {
		log.Fatal(err)
	}

	defer amqpConn.Close()

	// create amqp channel that is used to communicate with rabbitMq
	channel, err := amqpConn.Channel()

	if err != nil {
		log.Fatal(err)
	}

	defer channel.Close()

	// create a new durable queue -> in this case the name is 'booking.created', durable means persistent
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

	handler := &booking.BookingHandler{
		Repo:          booking.NewBookingRepository(pool),
		CatalogClient: catalog,
		RabbitChannel: channel,
	}

	app := fiber.New()

	// Swagger UI at http://localhost:3001/swagger/index.html
	app.Get("/swagger/*", swaggo.HandlerDefault)

	app.Use(middleware.SlowDown())

	secret := []byte(os.Getenv("JWT_SECRET"))

	booking.BookingRoutes(app, handler, secret)

	log.Fatal(app.Listen(":3001"))
}
