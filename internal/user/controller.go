package user

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"firebase.google.com/go/v4/auth"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type UserHandler struct {
	Repo         *UserRepository
	JWTSecret    []byte
	FirebaseAuth *auth.Client // signs Firebase custom tokens
}

// RegisterUser godoc
// @Summary      Create an account
// @Description  Auth: public. Creates a normal user (role "user"). Does not log in: call POST /auth/login afterwards.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      RegisterRequest  true  "Email, username and password (8-72 characters)"
// @Success      201   {object}  User
// @Failure      400   {object}  ErrorResponse  "body can't be parsed, empty field, bad password length, or email already used"
// @Failure      500   {object}  ErrorResponse
// @Router       /auth/register [post]
func (h *UserHandler) RegisterUser(c fiber.Ctx) error {
	var body RegisterRequest
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

// LoginUser godoc
// @Summary      Log in
// @Description  Auth: public. Checks email + password and sets the "jwt" HttpOnly cookie (valid 24 hours). The other services read that cookie.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      LoginRequest  true  "Email and password"
// @Success      200   {object}  LoginResponse
// @Header       200   {string}  Set-Cookie  "jwt=<token>; Path=/; HttpOnly"
// @Failure      400   {object}  ErrorResponse  "body can't be parsed"
// @Failure      401   {object}  ErrorResponse  "wrong email or password"
// @Failure      500   {object}  ErrorResponse
// @Router       /auth/login [post]
func (h *UserHandler) LoginUser(c fiber.Ctx) error {
	var body LoginRequest
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

	return c.Status(fiber.StatusOK).JSON(LoginResponse{Message: "login successful", Role: u.Role})
}

// LogoutUser godoc
// @Summary      Log out
// @Description  Auth: login required. Clears the "jwt" cookie.
// @Tags         auth
// @Produce      json
// @Success      200  {object}  MessageResponse
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Router       /auth/logout [post]
func (h *UserHandler) LogoutUser(c fiber.Ctx) error {
	// clear the cookie (Path must match the login cookie)
	c.Cookie(&fiber.Cookie{
		Name:     "jwt",
		Value:    "",
		Path:     "/",
		Expires:  time.Now().Add(-(24 * time.Hour)),
		HTTPOnly: true,
	})

	return c.JSON(MessageResponse{Message: "logged out successfully"})
}

// GetAllUsers godoc
// @Summary      List users (admin table)
// @Description  Auth: admin only. One page of users. All filters combine with AND. (Responses may be slowed down by SLOW_MS, to test loading states.)
// @Tags         users
// @Produce      json
// @Param        page      query  int     false  "Page number"               default(1)
// @Param        limit     query  int     false  "Rows per page (max 100)"   default(10)
// @Param        sort      query  string  false  "Sort column"     Enums(username, email, role, created_at)
// @Param        order     query  string  false  "Sort direction"  Enums(asc, desc)
// @Param        role      query  string  false  "Comma-separated roles (admin, user), e.g. admin,user"
// @Param        username  query  string  false  "Search in the username"
// @Param        email     query  string  false  "Search in the email"
// @Param        q         query  string  false  "Search in username or email"
// @Success      200  {object}  UserPage
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      403  {object}  ErrorResponse  "not an admin"
// @Failure      500  {object}  ErrorResponse
// @Router       /users [get]
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

	return c.JSON(UserPage{Data: list, Total: total, Page: page, Limit: limit})
}

// GetAllUsername godoc
// @Summary      All users, short form (lookup list)
// @Description  Auth: admin only. Every user with id, username, email and role, not paginated. (Responses may be slowed down by SLOW_MS.)
// @Tags         users
// @Produce      json
// @Param        sort  query     string  false  "Order by username"  Enums(asc, desc)
// @Success      200   {array}   UserSummary
// @Failure      401   {object}  ErrorResponse  "not logged in"
// @Failure      403   {object}  ErrorResponse  "not an admin"
// @Failure      500   {object}  ErrorResponse
// @Router       /usernames [get]
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

// GetMe godoc
// @Summary      Who am I
// @Description  Auth: login required. The logged-in user's profile. A valid cookie for a deleted user also gives 401.
// @Tags         auth
// @Produce      json
// @Success      200  {object}  User
// @Failure      401  {object}  ErrorResponse  "not logged in, or user not found"
// @Failure      500  {object}  ErrorResponse
// @Router       /auth/me [get]
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

// GetFirebaseToken godoc
// @Summary      Firebase custom token
// @Description  Auth: login required. A Firebase custom token whose uid is our user id; the frontend passes it to signInWithCustomToken so it can read its notifications from Firestore.
// @Tags         auth
// @Produce      json
// @Success      200  {object}  FirebaseTokenResponse
// @Failure      401  {object}  ErrorResponse  "not logged in"
// @Failure      500  {object}  ErrorResponse  "could not create firebase token"
// @Router       /auth/firebase-token [get]
//
// The browser is logged in with our own JWT cookie, but Firestore only trusts Firebase Auth.
// So we "translate": make a Firebase custom token whose uid is our user id as a string.
// The frontend signs in with it, and the Firestore rules compare request.auth.uid with recipientId.
func (h *UserHandler) GetFirebaseToken(c fiber.Ctx) error {
	userID := c.Locals("userId").(int64)

	token, err := h.FirebaseAuth.CustomToken(c.Context(), strconv.FormatInt(userID, 10))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not create firebase token"})
	}

	return c.JSON(FirebaseTokenResponse{Token: token})
}
