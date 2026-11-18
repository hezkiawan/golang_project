package notification

import (
	"golang-microservice-practice/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func NotificationRoutes(app *fiber.App, handler *NotificationHandler, secret []byte) {

	auth := middleware.AuthMiddleware(secret)

	app.Get("/notifications", auth, middleware.AdminOnly(), handler.GetNotifications)

	app.Get("/notifications/me", auth, handler.GetMyNotifications)

}
