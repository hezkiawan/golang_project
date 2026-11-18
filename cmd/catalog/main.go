package main

import (
	"context"
	"log"
	"net"
	"os"

	"golang-microservice-practice/internal/catalog"
	"golang-microservice-practice/internal/middleware"

	catalogpb "golang-microservice-practice/proto"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"google.golang.org/grpc"
)

func main() {

	// load .env so catalog can verify jwt tokens with the same secret as user service
	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env: ", err)
	}

	secret := []byte(os.Getenv("JWT_SECRET"))

	// creat postgres connection pool
	pool, err := pgxpool.New(
		context.Background(),
		"postgres://homefix:homefix@localhost:5435/homefix?sslmode=disable",
	)

	if err != nil {
		log.Fatal(err)
	}

	// defer clos the connection when main exits
	defer pool.Close()

	// check if postgres reachable
	if err := pool.Ping(context.Background()); err != nil {
		log.Fatal(err)
	}

	handler := &catalog.CatalogHandler{
		Repo: catalog.NewCatalogRepository(pool),
	}

	// create new fiber instance
	app := fiber.New()

	app.Use(middleware.SlowDown()) 

	catalog.CatalogRoutes(app, handler, secret)

	// open TCP listener on a different port for gRPC server
	lis, err := net.Listen("tcp", ":50051")

	if err != nil {
		log.Fatal(err)
	}

	// create a new grpc server from the grpc package
	grpcServer := grpc.NewServer()

	// register our service with the grpc server
	catalogpb.RegisterCatalogServiceServer(
		grpcServer,
		catalog.NewCatalogServer(pool),
	)

	// run the grpc server with goroutine
	go func() {
		log.Fatal(grpcServer.Serve(lis))
	}()

	// start HTTP server on port
	log.Fatal(app.Listen(":3002"))

}
