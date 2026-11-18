ALTER TABLE bookings
ADD COLUMN customer_name TEXT NOT NULL;

ALTER TABLE bookings
DROP COLUMN user_id;