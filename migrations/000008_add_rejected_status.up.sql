-- 'rejected' = an admin said no. It is separate from 'cancelled' (the user changed their mind)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rejected'));

-- no index change needed: one_active_booking_per_day only covers pending/confirmed,
-- so a rejected booking frees the date automatically
