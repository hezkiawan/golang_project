package catalog

import (
	"golang-microservice-practice/internal/middleware"

	"github.com/gofiber/fiber/v3"
)

func CatalogRoutes(app *fiber.App, handler *CatalogHandler, secret []byte) {

	auth := middleware.AuthMiddleware(secret)

	// anyone can see the list of services
	app.Get("/services", handler.GetServices)

	// only admins can add a service: who are you? -> are you allowed? -> handler
	app.Post("/services", auth, middleware.AdminOnly(), handler.CreateService)

}
