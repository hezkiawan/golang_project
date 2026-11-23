package notification

import (
	"context"

	"github.com/jackc/pgx/v5"
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

const notificationColumns = "id, booking_id, service_id, user_id, message, created_at"

// all notifications (admin)
func (r *NotificationRepository) GetAll(ctx context.Context) ([]Notification, error) {
	rows, err := r.DB.Query(ctx, "SELECT "+notificationColumns+" FROM notifications ORDER BY id")
	if err != nil {
		return nil, err
	}
	return scanNotifications(rows)
}

// one user's notifications, newest first
func (r *NotificationRepository) GetByUser(ctx context.Context, userID int64) ([]Notification, error) {
	rows, err := r.DB.Query(ctx,
		"SELECT "+notificationColumns+" FROM notifications WHERE user_id = $1 ORDER BY id DESC",
		userID)
	if err != nil {
		return nil, err
	}
	return scanNotifications(rows)
}

// save one notification (used by the RabbitMQ consumer)
func (r *NotificationRepository) Create(ctx context.Context, bookingID int64, serviceID int64, userID int64, message string) error {
	_, err := r.DB.Exec(ctx,
		"INSERT INTO notifications (booking_id, service_id, user_id, message) VALUES ($1, $2, $3, $4)",
		bookingID, serviceID, userID, message)
	return err
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

// shared by GetAll and GetByUser: turns rows into a list (lowercase = only usable inside this package)
func scanNotifications(rows pgx.Rows) ([]Notification, error) {
	defer rows.Close()

	list := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.BookingID, &n.ServiceID, &n.UserID, &n.Message, &n.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}
