-- 1. add the date column. old test rows get today's date so NOT NULL doesn't fail
ALTER TABLE bookings ADD COLUMN booking_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- 2. remove the default, so from now on every new booking MUST send a date
ALTER TABLE bookings ALTER COLUMN booking_date DROP DEFAULT;

-- 3. old test bookings are all 'pending' on the same date -> they would break the unique index below, so cancel them
UPDATE bookings SET status = 'cancelled';

-- 4. status can only be one of these 3 values
ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'confirmed', 'cancelled'));

-- 5. THE CONCURRENCY RULE: one service + one date = max one ACTIVE booking
--    "WHERE ..." makes it a partial index: cancelled rows are ignored, so cancelling frees the date
CREATE UNIQUE INDEX one_active_booking_per_day
ON bookings (service_id, booking_date)
WHERE status IN ('pending', 'confirmed');