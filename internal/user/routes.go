package user

import (
	"golang-microservice-practice/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func UserRoutes(app *fiber.App, handler *UserHandler, authMiddleware fiber.Handler) {
	auth := app.Group("auth")
	auth.Post("/register", handler.RegisterUser)
	auth.Post("/login", handler.LoginUser)
	auth.Post("/logout", authMiddleware, handler.LogoutUser)
	auth.Get("/me", authMiddleware, handler.GetMe)

	app.Get("/users", middleware.SlowDown(), authMiddleware, middleware.AdminOnly(), handler.GetAllUsers)
	app.Get("/usernames", middleware.SlowDown(), authMiddleware, middleware.AdminOnly(), handler.GetAllUsername)

}
