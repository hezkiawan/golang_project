package notification

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type NotificationRepository struct {
	DB *pgxpool.Pool
}

func NewNotificationRepository(db *pgxpool.Pool) *NotificationRepository {
	return &NotificationRepository{
		DB: db,
	}
}

// ids of every admin: each one gets their own "New booking" notification
func (r *NotificationRepository) GetAdminIDs(ctx context.Context) ([]int64, error) {
	rows, err := r.DB.Query(ctx, "SELECT id FROM users WHERE role = 'admin' ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return ids, nil
}
