package catalog

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
)

type CatalogHandler struct {
	Repo *CatalogRepository
}

func (h *CatalogHandler) GetServices(c fiber.Ctx) error {

	list, err := h.Repo.GetServices(c.Context())

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.JSON(list)
}

func (h *CatalogHandler) CreateService(c fiber.Ctx) error {

	var body ServiceRequest
	if err := c.Bind().Body(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	newService, err := h.Repo.CreateService(c.Context(), body.Name)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.Status(fiber.StatusCreated).JSON(newService)

}

// PUT /services/:id  body: {"name": "..."}
func (h *CatalogHandler) UpdateService(c fiber.Ctx) error {
	// get :id from url and convert string -> int64
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	var body ServiceRequest
	if err := c.Bind().Body(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	updated, err := h.Repo.UpdateService(c.Context(), id, body.Name)
	if errors.Is(err, ErrServiceNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.JSON(updated)
}

// DELETE /services/:id  (soft delete)
func (h *CatalogHandler) DeleteService(c fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid service id"})
	}

	err = h.Repo.DeleteService(c.Context(), id)
	if errors.Is(err, ErrServiceNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	// 204 = it worked, nothing to send back
	return c.SendStatus(fiber.StatusNoContent)
}
