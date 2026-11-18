package booking

import (
	"golang-microservice-practice/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func BookingRoutes(app *fiber.App, handler *BookingHandler, secret []byte) {

	auth := middleware.AuthMiddleware(secret)

	app.Post("/bookings", auth, handler.CreateBooking)
	app.Get("/bookings", auth, middleware.AdminOnly(), handler.GetBookings)

	app.Get("/bookings/me", auth, handler.GetMyBookings)
	app.Post("/bookings/:id/confirm", auth, handler.ConfirmBooking)
	app.Post("/bookings/:id/cancel", auth, handler.CancelBooking)
	app.Get("/bookings/availability", auth, handler.GetAvailability)
}
