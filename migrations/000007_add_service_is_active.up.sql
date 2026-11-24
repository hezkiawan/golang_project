-- soft delete: a "deleted" service stays in the table, so old bookings
-- can still JOIN to it and show its name
ALTER TABLE services ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
