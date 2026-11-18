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

// one row of GET /usernames (the lookup list)
type UserSummary struct {
	ID       int64  `json:"user_id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}
