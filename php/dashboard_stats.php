<?php
require_once "db.php";
header("Content-Type: application/json");

$total = $conn->query("SELECT COUNT(*) AS c FROM orders")->fetch_assoc()["c"] ?? 0;
$pending = $conn->query("SELECT COUNT(*) AS c FROM orders WHERE status='Pending'")->fetch_assoc()["c"] ?? 0;
$delivered = $conn->query("SELECT COUNT(*) AS c FROM orders WHERE status='Delivered'")->fetch_assoc()["c"] ?? 0;
$cancelled = $conn->query("SELECT COUNT(*) AS c FROM orders WHERE status='Cancelled'")->fetch_assoc()["c"] ?? 0;
$profit = $conn->query("SELECT COALESCE(SUM(profit_amount), 0) AS total_profit FROM orders WHERE status='Delivered'")->fetch_assoc()["total_profit"] ?? 0;

echo json_encode([
    "total_orders" => (int) $total,
    "pending_orders" => (int) $pending,
    "delivered_orders" => (int) $delivered,
    "cancelled_orders" => (int) $cancelled,
    "total_profit" => (float) $profit
]);
?>
