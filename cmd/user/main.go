package main

import (
	"context"
	"golang-microservice-practice/internal/middleware"
	"golang-microservice-practice/internal/user"
	routes "golang-microservice-practice/internal/user"
	"log"
	"os"

	firebase "firebase.google.com/go/v4"
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

	// FIREBASE: same setup as the notification service. The key file comes from
	// GOOGLE_APPLICATION_CREDENTIALS; we need it to sign Firebase custom tokens.
	firebaseApp, err := firebase.NewApp(context.Background(), &firebase.Config{
		ProjectID: os.Getenv("FIREBASE_PROJECT_ID"),
	})
	if err != nil {
		log.Fatal("firebase init: ", err)
	}
	firebaseAuth, err := firebaseApp.Auth(context.Background())
	if err != nil {
		log.Fatal("firebase auth init: ", err)
	}

	handler := user.UserHandler{
		Repo:         user.NewUserRepository(pool), // was: DB: pool
		JWTSecret:    secret,
		FirebaseAuth: firebaseAuth,
	}

	// create fiber app
	app := fiber.New()
	routes.UserRoutes(app, &handler, authMiddleware)

	// run server
	log.Fatal(app.Listen(":3003"))
}
