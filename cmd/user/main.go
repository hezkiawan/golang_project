package main

import (
	"context"
	"golang-microservice-practice/internal/middleware"
	"golang-microservice-practice/internal/user"
	routes "golang-microservice-practice/internal/user"
	"log"
	"os"

	_ "golang-microservice-practice/docs/user" // registers the generated spec (the _ means "import only for its side effect")

	firebase "firebase.google.com/go/v4"
	"github.com/gofiber/contrib/v3/swaggo"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// @title           HomeFix User Service API
// @version         1.0
// @description     Accounts: register, login/logout, "who am I", the Firebase token for the notification bell, and the admin user lists.
// @description     Auth: POST /auth/login sets the "jwt" HttpOnly cookie; the browser sends it automatically (also to the booking and catalog services).
// @description     No cookie → 401. Routes marked "admin only" give 403 to normal users.
// @host            localhost:3003
// @BasePath        /

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

	// Swagger UI at http://localhost:3003/swagger/index.html
	// After changing a godoc comment, regenerate from the project root:
	//   swag init -d cmd/user,internal/user -g main.go -o docs/user
	app.Get("/swagger/*", swaggo.HandlerDefault)

	routes.UserRoutes(app, &handler, authMiddleware)

	// run server
	log.Fatal(app.Listen(":3003"))
}
