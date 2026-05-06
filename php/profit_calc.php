<?php
require_once "db.php";
header("Content-Type: application/json");

$result = $conn->query("SELECT id, customer_name, product, quantity, price, profit_amount, delivery_date FROM orders WHERE status='Delivered' ORDER BY id DESC");
$orders = [];
$totalProfit = 0;
while ($row = $result->fetch_assoc()) {
    $orders[] = $row;
    $totalProfit += (float) $row["profit_amount"];
}

$dailyProfit = $conn->query("SELECT COALESCE(SUM(profit_amount), 0) AS v FROM orders WHERE status='Delivered' AND delivery_date = CURDATE()")->fetch_assoc()["v"] ?? 0;
$weeklyProfit = $conn->query("SELECT COALESCE(SUM(profit_amount), 0) AS v FROM orders WHERE status='Delivered' AND YEARWEEK(delivery_date, 1) = YEARWEEK(CURDATE(), 1)")->fetch_assoc()["v"] ?? 0;
$monthlyProfit = $conn->query("SELECT COALESCE(SUM(profit_amount), 0) AS v FROM orders WHERE status='Delivered' AND YEAR(delivery_date) = YEAR(CURDATE()) AND MONTH(delivery_date) = MONTH(CURDATE())")->fetch_assoc()["v"] ?? 0;
$yearlyProfit = $conn->query("SELECT COALESCE(SUM(profit_amount), 0) AS v FROM orders WHERE status='Delivered' AND YEAR(delivery_date) = YEAR(CURDATE())")->fetch_assoc()["v"] ?? 0;

echo json_encode([
    "total_profit" => $totalProfit,
    "daily_profit" => (float) $dailyProfit,
    "weekly_profit" => (float) $weeklyProfit,
    "monthly_profit" => (float) $monthlyProfit,
    "yearly_profit" => (float) $yearlyProfit,
    "orders" => $orders
]);
?>
