package catalog

import (
	"context"
	"strings"

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

// Get all services
func (r *CatalogRepository) GetServices() ([]Service, error) {
	rows, err := r.DB.Query(context.Background(),
		"SELECT id, name FROM services ORDER BY id",
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

func (r *CatalogRepository) CreateService(name string) (Service, error){
	var s Service
	err := r.DB.QueryRow(context.Background(), 
			"INSERT INTO services (name) VALUES ($1) RETURNING id, name", 
			strings.TrimSpace(name)).Scan(&s.ID,&s.Name)
	
	return s, err
}
