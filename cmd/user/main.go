package main

import (
	"context"
	"golang-microservice-practice/internal/middleware"
	"golang-microservice-practice/internal/user"
	routes "golang-microservice-practice/internal/user"
	"log"
	"os"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env ", err)
	}

	// create a postgres connection pool
	pool, err := pgxpool.New(context.Background(), "postgres://homefix:homefix@localhost:5435/homefix?sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	secret := []byte(os.Getenv("JWT_SECRET"))

	authMiddleware := middleware.AuthMiddleware(secret)

	handler := user.UserHandler{
		Repo:      user.NewUserRepository(pool), // was: DB: pool
		JWTSecret: secret,
	}

	// create fiber app
	app := fiber.New()
	routes.UserRoutes(app, &handler, authMiddleware)

	// run server
	log.Fatal(app.Listen(":3003"))
}
