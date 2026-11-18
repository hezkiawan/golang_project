package user

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// our own error, so the handler can say 401/404 without knowing about pgx
var ErrUserNotFound = errors.New("user not found")

type UserRepository struct {
	DB *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{
		DB: db,
	}
}

// what the admin users table asks for (already validated by the handler)
type UserFilter struct {
	Page     int
	Limit    int
	Sort     string   // a whitelisted column
	Order    string   // "asc" or "desc"
	Username string   // search in username ("" = no search)
	Email    string   // search in email
	Query    string   // global search: username OR email
	Roles    []string // whitelisted roles, empty = all
}

// ---------- register ----------

func (r *UserRepository) EmailExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := r.DB.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)", email).Scan(&exists)
	return exists, err
}

func (r *UserRepository) CreateUser(ctx context.Context, username string, email string, passwordHash []byte) (User, error) {
	var u User
	err := r.DB.QueryRow(ctx,
		"INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, role, created_at",
		username, email, passwordHash,
	).Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.CreatedAt)
	return u, err
}

// ---------- login / me ----------

func (r *UserRepository) GetAuthByEmail(ctx context.Context, email string) (UserAuth, error) {
	var u UserAuth
	err := r.DB.QueryRow(ctx,
		"SELECT id, username, email, password_hash, role, created_at FROM users WHERE email = $1",
		email,
	).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrUserNotFound
	}
	return u, err
}

func (r *UserRepository) GetByID(ctx context.Context, id int64) (User, error) {
	var u User
	err := r.DB.QueryRow(ctx,
		"SELECT id, username, email, role, created_at FROM users WHERE id = $1",
		id,
	).Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrUserNotFound
	}
	return u, err
}

//ADMIN TABLE

// one page of users + the total that match the filter
func (r *UserRepository) GetUsersPage(ctx context.Context, f UserFilter) ([]User, int, error) {
	conditions := []string{}
	args := []any{}

	if f.Username != "" {
		args = append(args, "%"+f.Username+"%")
		conditions = append(conditions, fmt.Sprintf("username ILIKE $%d", len(args)))
	}
	if f.Email != "" {
		args = append(args, "%"+f.Email+"%")
		conditions = append(conditions, fmt.Sprintf("email ILIKE $%d", len(args)))
	}
	if f.Query != "" {
		args = append(args, "%"+f.Query+"%")
		n := len(args)
		conditions = append(conditions, fmt.Sprintf("(username ILIKE $%d OR email ILIKE $%d)", n, n))
	}
	if len(f.Roles) > 0 {
		args = append(args, f.Roles)
		conditions = append(conditions, fmt.Sprintf("role = ANY($%d)", len(args)))
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	// total of matching users
	var total int
	if err := r.DB.QueryRow(ctx, "SELECT COUNT(*) FROM users "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// one page of them
	query := fmt.Sprintf(
		"SELECT id, username, email, role, created_at FROM users %s ORDER BY %s %s, id ASC LIMIT $%d OFFSET $%d",
		where, f.Sort, f.Order, len(args)+1, len(args)+2)

	rows, err := r.DB.Query(ctx, query, append(args, f.Limit, (f.Page-1)*f.Limit)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.CreatedAt); err != nil {
			return nil, 0, err
		}
		list = append(list, u)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return list, total, nil
}

// ---------- lookup list ----------

// order is "asc", "desc" or "" (already checked by the handler)
func (r *UserRepository) GetUserSummaries(ctx context.Context, order string) ([]UserSummary, error) {
	orderBy := "id"
	if order == "asc" || order == "desc" {
		orderBy = "username " + order // safe: order can only be "asc" or "desc" here
	}

	rows, err := r.DB.Query(ctx, "SELECT id, username, email, role FROM users ORDER BY "+orderBy)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []UserSummary{}
	for rows.Next() {
		var u UserSummary
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.Role); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}
