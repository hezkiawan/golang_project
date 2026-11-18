package middleware

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

func AuthMiddleware(secret []byte) fiber.Handler {
	return func(c fiber.Ctx) error {

		// ambil signed jwt string dari cookies
		signedToken := c.Cookies("jwt")

		// error handling if there is no jwt
		if signedToken == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized - jwt not found"})
		}

		// parse jwt token
		token, err := jwt.Parse(signedToken, func(token *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized - cant parse jwt"})
		}

		// check token valid dengan ambil claim nya
		claims := token.Claims.(jwt.MapClaims)

		// check expiry
		if float64(time.Now().Unix()) > claims["exp"].(float64) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized - jwt expired"})
		}

		userIdFloat, ok := claims["userId"].(float64)

		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized - userId not found in jwt"})
		}

		c.Locals("userId", int64(userIdFloat))

		role, _ := claims["role"].(string)
		c.Locals("role", role)

		return c.Next()
	}

}

// AdminOnly must run AFTER AuthMiddleware, because it reads the role that AuthMiddleware saved
func AdminOnly() fiber.Handler {
	return func(c fiber.Ctx) error {
		role, _ := c.Locals("role").(string)

		// logged in, but not allowed -> 403 Forbidden (not 401)
		if role != "admin" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "admin only"})
		}

		return c.Next()
	}
}
