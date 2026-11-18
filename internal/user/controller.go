package user

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type UserHandler struct {
	Repo      *UserRepository
	JWTSecret []byte
}

func (h *UserHandler) RegisterUser(c fiber.Ctx) error {
	type reqBody struct {
		Email    string `json:"email"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	var body reqBody
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cant parse body"})
	}

	email := strings.TrimSpace(body.Email)
	username := strings.TrimSpace(body.Username)

	// input validation
	if email == "" || username == "" || body.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "input cant be empty"})
	}
	// bcrypt only accepts up to 72 bytes; 8 is our minimum
	if len(body.Password) < 8 || len(body.Password) > 72 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "password must be 8-72 characters"})
	}

	// check if the email is taken
	exists, err := h.Repo.EmailExists(c.Context(), email)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}
	if exists {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "user with the email already exist"})
	}

	// hash the password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(body.Password), 14)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "password encryption"})
	}

	// save the user
	u, err := h.Repo.CreateUser(c.Context(), username, email, hashedPassword)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	return c.Status(fiber.StatusCreated).JSON(u)
}

func (h *UserHandler) LoginUser(c fiber.Ctx) error {
	type reqBody struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	var body reqBody
	if err := c.Bind().Body(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "can not parse request"})
	}

	// get the user by email
	u, err := h.Repo.GetAuthByEmail(c.Context(), strings.TrimSpace(body.Email))
	if errors.Is(err, ErrUserNotFound) {
		// same message as a wrong password: don't tell attackers which emails exist
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "wrong email or password"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	// check the password
	if err := bcrypt.CompareHashAndPassword(u.PasswordHash, []byte(body.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "wrong email or password"})
	}

	// create and sign the jwt
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"userId": u.ID,
		"role":   u.Role,
		"exp":    time.Now().Add(24 * time.Hour).Unix(),
	})
	signedToken, err := token.SignedString(h.JWTSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "cant sign jwt token"})
	}

	// put the jwt in a cookie
	c.Cookie(&fiber.Cookie{
		Name:     "jwt",
		Value:    signedToken,
		Path:     "/",
		Expires:  time.Now().Add(24 * time.Hour),
		HTTPOnly: true,
	})

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": "login successful", "role": u.Role})
}

func (h *UserHandler) LogoutUser(c fiber.Ctx) error {
	// clear the cookie (Path must match the login cookie)
	c.Cookie(&fiber.Cookie{
		Name:     "jwt",
		Value:    "",
		Path:     "/",
		Expires:  time.Now().Add(-(24 * time.Hour)),
		HTTPOnly: true,
	})

	return c.JSON(fiber.Map{"message": "logged out successfully"})
}

func (h *UserHandler) GetAllUsers(c fiber.Ctx) error {
	// pagination
	page, err := strconv.Atoi(c.Query("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(c.Query("limit", "10"))
	if err != nil || limit < 1 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}

	// sorting: map whitelist
	sortColumns := map[string]string{
		"username":   "username",
		"email":      "email",
		"role":       "role",
		"created_at": "created_at",
	}
	sortCol, ok := sortColumns[c.Query("sort")]
	if !ok {
		sortCol = "id"
	}
	order := strings.ToLower(c.Query("order"))
	if order != "asc" && order != "desc" {
		order = "asc"
	}

	// role filter: ?role=admin or ?role=admin,user
	allowed := map[string]bool{"admin": true, "user": true}
	roles := []string{}
	for _, part := range strings.Split(c.Query("role"), ",") {
		part = strings.TrimSpace(part)
		if allowed[part] {
			roles = append(roles, part)
		}
	}

	list, total, err := h.Repo.GetUsersPage(c.Context(), UserFilter{
		Page:     page,
		Limit:    limit,
		Sort:     sortCol,
		Order:    order,
		Username: strings.TrimSpace(c.Query("username")),
		Email:    strings.TrimSpace(c.Query("email")),
		Query:    strings.TrimSpace(c.Query("q")),
		Roles:    roles,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	return c.JSON(fiber.Map{"data": list, "total": total, "page": page, "limit": limit})
}

func (h *UserHandler) GetAllUsername(c fiber.Ctx) error {
	// only "asc" or "desc" are allowed; anything else = default order
	sort := strings.ToLower(strings.TrimSpace(c.Query("sort")))
	if sort != "asc" && sort != "desc" {
		sort = ""
	}

	list, err := h.Repo.GetUserSummaries(c.Context(), sort)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	return c.JSON(list)
}

func (h *UserHandler) GetMe(c fiber.Ctx) error {
	// userId was put here by the auth middleware, from the jwt cookie
	userID := c.Locals("userId").(int64)

	u, err := h.Repo.GetByID(c.Context(), userID)
	if errors.Is(err, ErrUserNotFound) {
		// jwt is valid but the user was deleted -> treat as logged out
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "user not found"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "database error"})
	}

	return c.JSON(u)
}
