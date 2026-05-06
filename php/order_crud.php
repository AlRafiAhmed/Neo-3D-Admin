<?php
require_once "db.php";
header("Content-Type: application/json");

$method = $_SERVER["REQUEST_METHOD"];

function readJsonBody() {
    $raw = file_get_contents("php://input");
    return json_decode($raw, true) ?? [];
}

function ordersHasOrderDateColumn(mysqli $conn) {
    $r = $conn->query("SHOW COLUMNS FROM orders LIKE 'order_date'");
    return $r && $r->num_rows > 0;
}

if ($method === "GET") {
    if (!empty($_GET["id"])) {
        $id = (int) $_GET["id"];
        $stmt = $GLOBALS["conn"]->prepare("SELECT * FROM orders WHERE id = ?");
        $stmt->bind_param("i", $id);
        $stmt->execute();
        $res = $stmt->get_result()->fetch_assoc();
        echo json_encode($res ?: []);
        exit;
    }

    $status = $_GET["status"] ?? "";
    $date = $_GET["date"] ?? "";
    $customer = $_GET["customer"] ?? "";
    $product = $_GET["product"] ?? "";

    $sql = "SELECT * FROM orders WHERE 1=1";
    $types = "";
    $params = [];

    if ($status !== "") {
        $sql .= " AND status = ?";
        $types .= "s";
        $params[] = $status;
    }
    if ($date !== "") {
        $sql .= " AND delivery_date = ?";
        $types .= "s";
        $params[] = $date;
    }
    if ($customer !== "") {
        $sql .= " AND customer_name LIKE ?";
        $types .= "s";
        $params[] = "%" . $customer . "%";
    }
    if ($product !== "") {
        $sql .= " AND product LIKE ?";
        $types .= "s";
        $params[] = "%" . $product . "%";
    }

    $sql .= " ORDER BY id DESC";
    $stmt = $conn->prepare($sql);
    if (!empty($params)) {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $orders = [];
    while ($row = $result->fetch_assoc()) {
        $orders[] = $row;
    }
    echo json_encode($orders);
    exit;
}

if ($method === "POST") {
    $data = readJsonBody();
    $customer = trim((string) ($data["customer_name"] ?? ""));
    $product = trim((string) ($data["product"] ?? ""));
    $quantity = (int) ($data["quantity"] ?? 0);
    $price = (float) ($data["price"] ?? 0);
    $profitAmount = (float) ($data["profit_amount"] ?? 0);
    $status = $data["status"] ?? "Pending";
    $orderDate = trim((string) ($data["order_date"] ?? ""));
    if ($orderDate === "") {
        $orderDate = date("Y-m-d");
    }
    $delivery = isset($data["delivery_date"]) ? trim((string) $data["delivery_date"]) : "";
    if ($delivery === "") {
        $delivery = date("Y-m-d");
    }

    if ($customer === "" || $product === "") {
        echo json_encode(["success" => false, "message" => "Customer name and product are required."]);
        exit;
    }

    $hasOrderDate = ordersHasOrderDateColumn($conn);

    if ($hasOrderDate) {
        $stmt = $conn->prepare(
            "INSERT INTO orders (customer_name, product, quantity, price, profit_amount, status, order_date, delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        if (!$stmt) {
            echo json_encode(["success" => false, "message" => "Database error: " . $conn->error]);
            exit;
        }
        $stmt->bind_param("ssiddsss", $customer, $product, $quantity, $price, $profitAmount, $status, $orderDate, $delivery);
    } else {
        $stmt = $conn->prepare(
            "INSERT INTO orders (customer_name, product, quantity, price, profit_amount, status, delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        if (!$stmt) {
            echo json_encode(["success" => false, "message" => "Database error: " . $conn->error]);
            exit;
        }
        $stmt->bind_param("ssiddss", $customer, $product, $quantity, $price, $profitAmount, $status, $delivery);
    }

    $ok = $stmt->execute();
    $err = $stmt->error;
    echo json_encode([
        "success" => $ok,
        "message" => $ok ? "Order saved successfully." : ("Failed to create order." . ($err ? " " . $err : "")),
    ]);
    exit;
}

if ($method === "PUT") {
    $data = readJsonBody();
    $id = (int) ($data["id"] ?? 0);
    $customer = trim((string) ($data["customer_name"] ?? ""));
    $product = trim((string) ($data["product"] ?? ""));
    $quantity = (int) ($data["quantity"] ?? 0);
    $price = (float) ($data["price"] ?? 0);
    $profitAmount = (float) ($data["profit_amount"] ?? 0);
    $status = $data["status"] ?? "Pending";
    $delivery = isset($data["delivery_date"]) ? trim((string) $data["delivery_date"]) : "";
    if ($delivery === "") {
        $delivery = date("Y-m-d");
    }

    $hasOrderDate = ordersHasOrderDateColumn($conn);
    $orderDate = trim((string) ($data["order_date"] ?? ""));
    if ($hasOrderDate && $orderDate === "") {
        $prev = $conn->prepare("SELECT order_date FROM orders WHERE id = ?");
        if ($prev) {
            $prev->bind_param("i", $id);
            $prev->execute();
            $row = $prev->get_result()->fetch_assoc();
            $orderDate = $row["order_date"] ?? date("Y-m-d");
        } else {
            $orderDate = date("Y-m-d");
        }
    } elseif (!$hasOrderDate) {
        $orderDate = "";
    }

    if ($hasOrderDate) {
        $stmt = $conn->prepare(
            "UPDATE orders SET customer_name = ?, product = ?, quantity = ?, price = ?, profit_amount = ?, status = ?, order_date = ?, delivery_date = ? WHERE id = ?"
        );
        if (!$stmt) {
            echo json_encode(["success" => false, "message" => "Database error: " . $conn->error]);
            exit;
        }
        $stmt->bind_param("ssiddsssi", $customer, $product, $quantity, $price, $profitAmount, $status, $orderDate, $delivery, $id);
    } else {
        $stmt = $conn->prepare(
            "UPDATE orders SET customer_name = ?, product = ?, quantity = ?, price = ?, profit_amount = ?, status = ?, delivery_date = ? WHERE id = ?"
        );
        if (!$stmt) {
            echo json_encode(["success" => false, "message" => "Database error: " . $conn->error]);
            exit;
        }
        $stmt->bind_param("ssiddssi", $customer, $product, $quantity, $price, $profitAmount, $status, $delivery, $id);
    }

    $ok = $stmt->execute();
    echo json_encode([
        "success" => $ok,
        "message" => $ok ? "Order updated successfully." : ("Failed to update order." . ($stmt->error ? " " . $stmt->error : "")),
    ]);
    exit;
}

if ($method === "DELETE") {
    $id = (int) ($_GET["id"] ?? 0);
    $stmt = $conn->prepare("DELETE FROM orders WHERE id = ?");
    $stmt->bind_param("i", $id);
    $ok = $stmt->execute();
    echo json_encode([
        "success" => $ok,
        "message" => $ok ? "Order deleted successfully." : "Failed to delete order."
    ]);
    exit;
}

http_response_code(405);
echo json_encode(["success" => false, "message" => "Method not allowed"]);
?>
