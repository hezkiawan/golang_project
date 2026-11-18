DROP INDEX IF EXISTS one_active_booking_per_day;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings DROP COLUMN IF EXISTS booking_date;