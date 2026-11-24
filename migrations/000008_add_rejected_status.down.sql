-- the old CHECK doesn't know 'rejected', so turn those rows into 'cancelled' first
UPDATE bookings SET status = 'cancelled' WHERE status = 'rejected';

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'confirmed', 'cancelled'));
