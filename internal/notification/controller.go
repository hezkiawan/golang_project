package notification

import (
	"github.com/gofiber/fiber/v3"
)

type NotificationHandler struct {
	Repo *NotificationRepository
}

// admin: everyone's notifications
func (h *NotificationHandler) GetNotifications(c fiber.Ctx) error {
	list, err := h.Repo.GetAll(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}
	return c.JSON(list)
}

// a user: only their own notifications
func (h *NotificationHandler) GetMyNotifications(c fiber.Ctx) error {
	// userId was put here by the auth middleware from the jwt
	userID := c.Locals("userId").(int64)

	list, err := h.Repo.GetByUser(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}
	return c.JSON(list)
}
