CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,

    booking_id BIGINT NOT NULL,
    service_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,

    message TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT NOW()
);