CREATE DATABASE IF NOT EXISTS neo3d_db;
USE neo3d_db;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(120) NOT NULL,
  product VARCHAR(150) NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  profit_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('Pending', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Pending',
  order_date DATE NOT NULL,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Existing installs: add order_date (run once; skip if column already exists)
-- ALTER TABLE orders ADD COLUMN order_date DATE NULL;
-- UPDATE orders SET order_date = DATE(COALESCE(created_at, NOW())) WHERE order_date IS NULL;
-- ALTER TABLE orders MODIFY order_date DATE NOT NULL;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS profit_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER price;

INSERT INTO admins (username, password)
VALUES ('neoadmin', 'secure123')
ON DUPLICATE KEY UPDATE username = username;

-- Optional secure alternative for password (uncomment to use hash):
-- UPDATE admins SET password = '$2y$10$xVJ6rQ8aMu2udvBz1j0jM.0gN0fciXf7zY7wWkxQ5x5WBYxJ5QSEK' WHERE username='neoadmin';
