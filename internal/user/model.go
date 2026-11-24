package user

import "time"

type User struct {
	ID        int64     `json:"user_id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// only used inside the user service for login. never sent as JSON: it holds the password hash
type UserAuth struct {
	ID           int64
	Username     string
	Email        string
	PasswordHash []byte
	Role         string
	CreatedAt    time.Time
}

// POST /auth/register body
type RegisterRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"` // 8-72 characters
}

// POST /auth/login body
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// POST /auth/login answer (the jwt itself goes into the HttpOnly cookie, not here)
type LoginResponse struct {
	Message string `json:"message"`
	Role    string `json:"role"`
}

// GET /auth/firebase-token answer
type FirebaseTokenResponse struct {
	Token string `json:"token"`
}

// a simple {"message": "..."} answer, e.g. after logout
type MessageResponse struct {
	Message string `json:"message"`
}

// GET /users: one page of the admin users table
type UserPage struct {
	Data  []User `json:"data"`
	Total int    `json:"total"`
	Page  int    `json:"page"`
	Limit int    `json:"limit"`
}

// error body returned by the handlers. Most errors use "error"; some 500s use "message"
type ErrorResponse struct {
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

// one row of GET /usernames (the lookup list)
type UserSummary struct {
	ID       int64  `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}
