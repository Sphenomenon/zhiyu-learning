CREATE INDEX users_created ON users(created_at DESC, id);
CREATE INDEX users_role_created ON users(role, created_at DESC, id);
CREATE INDEX codes_created ON redemption_codes(created_at DESC, id);
CREATE INDEX orders_created ON manual_orders(created_at DESC, id);
