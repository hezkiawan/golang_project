package middleware

import (
	"os"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
)

//  waits SLOW_MS milliseconds before every request 
func SlowDown() fiber.Handler {
	ms, _ := strconv.Atoi(os.Getenv("SLOW_MS")) // "2500" -> 2500, empty -> 0

	return func(c fiber.Ctx) error {
		if ms > 0 {
			time.Sleep(time.Duration(ms) * time.Millisecond)
		}
		return c.Next()
	}
}