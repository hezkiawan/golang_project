package main

import (
	"context"
	"log"
	"net"
	"os"

	"golang-microservice-practice/internal/catalog"
	"golang-microservice-practice/internal/middleware"

	catalogpb "golang-microservice-practice/proto"

	_ "golang-microservice-practice/docs/catalog" // registers the generated spec (the _ means "import only for its side effect")

	"github.com/gofiber/contrib/v3/swaggo"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"google.golang.org/grpc"
)

// @title           HomeFix Catalog Service API
// @version         1.0
// @description     Services list: anyone can read it, only admins can add, rename or delete.
// @description     Auth: log in at POST /auth/login (user service, port 3003). The browser then sends the jwt cookie automatically.
// @description     (The gRPC CheckServiceExists on port 50051 is not part of this HTTP API.)
// @host            localhost:3002
// @BasePath        /

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

	// Swagger UI at http://localhost:3002/swagger/index.html
	// After changing a godoc comment, regenerate from the project root:
	//   swag init -d cmd/catalog,internal/catalog -g main.go -o docs/catalog
	app.Get("/swagger/*", swaggo.HandlerDefault)

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
