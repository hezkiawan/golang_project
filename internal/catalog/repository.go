package catalog

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CatalogRepository struct {
	DB *pgxpool.Pool
}

// constructor
func NewCatalogRepository(db *pgxpool.Pool) *CatalogRepository {
	return &CatalogRepository{
		DB: db,
	}
}

// custom error for the handler: no active service with this id (→ 404)
var ErrServiceNotFound = errors.New("service not found")

// Get all active services (deleted ones are hidden from everyone)
func (r *CatalogRepository) GetServices(ctx context.Context) ([]Service, error) {
	rows, err := r.DB.Query(ctx,
		"SELECT id, name FROM services WHERE is_active = true ORDER BY id",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Service{}

	for rows.Next() {
		var s Service
		if err := rows.Scan(&s.ID, &s.Name); err != nil {
			return nil, err
		}
		list = append(list, s)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}

func (r *CatalogRepository) CreateService(ctx context.Context, name string) (Service, error) {
	var s Service
	err := r.DB.QueryRow(ctx,
		"INSERT INTO services (name) VALUES ($1) RETURNING id, name",
		strings.TrimSpace(name)).Scan(&s.ID, &s.Name)

	return s, err
}

// rename an active service; a missing or deleted service gives ErrServiceNotFound
func (r *CatalogRepository) UpdateService(ctx context.Context, id int64, name string) (Service, error) {
	var s Service
	err := r.DB.QueryRow(ctx,
		"UPDATE services SET name = $2 WHERE id = $1 AND is_active = true RETURNING id, name",
		id, strings.TrimSpace(name)).Scan(&s.ID, &s.Name)

	// no row came back: the id doesn't exist or the service was already deleted
	if errors.Is(err, pgx.ErrNoRows) {
		return s, ErrServiceNotFound
	}
	return s, err
}

// soft delete: only flip is_active, so bookings that use this service keep working
func (r *CatalogRepository) DeleteService(ctx context.Context, id int64) error {
	tag, err := r.DB.Exec(ctx,
		"UPDATE services SET is_active = false WHERE id = $1 AND is_active = true",
		id)
	if err != nil {
		return err
	}

	// 0 rows changed: the id doesn't exist or it was already deleted
	if tag.RowsAffected() == 0 {
		return ErrServiceNotFound
	}
	return nil
}
