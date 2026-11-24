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

// GetServices godoc
// @Summary      List services
// @Description  Auth: public (no login needed). All active services (deleted ones are hidden).
// @Tags         services
// @Produce      json
// @Success      200  {array}   Service
// @Failure      500  {object}  ErrorResponse
// @Router       /services [get]
func (h *CatalogHandler) GetServices(c fiber.Ctx) error {

	list, err := h.Repo.GetServices(c.Context())

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database error"})
	}

	return c.JSON(list)
}

// CreateService godoc
// @Summary      Add a service (admin)
// @Description  Auth: admin only. Creates a new service with this name.
// @Tags         services
// @Accept       json
// @Produce      json
// @Param        body  body      ServiceRequest  true  "Service name"
// @Success      201   {object}  Service
// @Failure      400   {object}  ErrorResponse  "name is required"
// @Failure      401   {object}  ErrorResponse  "not logged in"
// @Failure      403   {object}  ErrorResponse  "not an admin"
// @Failure      500   {object}  ErrorResponse
// @Router       /services [post]
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

// UpdateService godoc
// @Summary      Rename a service (admin)
// @Description  Auth: admin only. Changes the name of an active service.
// @Tags         services
// @Accept       json
// @Produce      json
// @Param        id    path      int             true  "Service id"
// @Param        body  body      ServiceRequest  true  "New name"
// @Success      200   {object}  Service
// @Failure      400   {object}  ErrorResponse  "invalid service id or name is required"
// @Failure      401   {object}  ErrorResponse  "not logged in"
// @Failure      403   {object}  ErrorResponse  "not an admin"
// @Failure      404   {object}  ErrorResponse  "service not found (or already deleted)"
// @Failure      500   {object}  ErrorResponse
// @Router       /services/{id} [put]
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

// DeleteService godoc
// @Summary      Delete a service (admin)
// @Description  Auth: admin only. Soft delete: the service disappears from the list, but old bookings still show its name.
// @Tags         services
// @Param        id   path  int  true  "Service id"
// @Success      204  "deleted, no body"
// @Failure      400  {object}  ErrorResponse  "invalid service id"
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      403  {object}  ErrorResponse  "not an admin"
// @Failure      404  {object}  ErrorResponse  "service not found (or already deleted)"
// @Failure      500  {object}  ErrorResponse
// @Router       /services/{id} [delete]
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
