-- Run once on existing databases that do not yet have order_date.
-- If you see "Duplicate column", the column already exists — skip this file.

USE neo3d_db;

ALTER TABLE orders ADD COLUMN order_date DATE NULL;
UPDATE orders SET order_date = DATE(COALESCE(created_at, NOW())) WHERE order_date IS NULL;
ALTER TABLE orders MODIFY order_date DATE NOT NULL;
