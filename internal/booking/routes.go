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
	app.Get("/bookings/availability", auth, handler.GetAvailability)
	// registered AFTER /me and /availability, so those two words are never read as an :id
	app.Get("/bookings/:id", auth, handler.GetBookingByID)

	// admin approves / rejects a pending booking
	app.Post("/bookings/:id/confirm", auth, middleware.AdminOnly(), handler.ConfirmBooking)
	app.Post("/bookings/:id/reject", auth, middleware.AdminOnly(), handler.RejectBooking)
	// a user cancels their own pending booking
	app.Post("/bookings/:id/cancel", auth, handler.CancelBooking)
}
