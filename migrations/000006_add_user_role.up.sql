-- every existing and new user is a normal 'user' unless we change it
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- only these two roles are allowed
ALTER TABLE users
ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));