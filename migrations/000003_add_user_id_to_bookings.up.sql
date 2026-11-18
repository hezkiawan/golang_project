ALTER TABLE bookings
ADD COLUMN user_id BIGINT NOT NULL;

ALTER TABLE bookings
DROP COLUMN customer_name;