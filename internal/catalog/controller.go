package catalog

import (
	"strings"

	"github.com/gofiber/fiber/v3"
)

type CatalogHandler struct {
	Repo *CatalogRepository
}

func (h *CatalogHandler) GetServices(c fiber.Ctx) error {

	list, err := h.Repo.GetServices()

	if err != nil {
		return c.Status(
			fiber.StatusInternalServerError,
		).JSON(
			fiber.Map{"message": "database error"},
		)
	}

	return c.JSON(list)
}

func (h *CatalogHandler) CreateService(c fiber.Ctx) error {

	var body ServiceRequest
	if err := c.Bind().Body(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	newService, err := h.Repo.CreateService(body.Name)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.Status(fiber.StatusCreated).JSON(newService)

}
