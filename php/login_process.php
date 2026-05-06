<?php
session_start();
require_once "db.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    header("Location: ../login.html");
    exit;
}

$username = $_POST["username"] ?? "";
$password = $_POST["password"] ?? "";

$stmt = $conn->prepare("SELECT id, username, password FROM admins WHERE username = ? LIMIT 1");
$stmt->bind_param("s", $username);
$stmt->execute();
$result = $stmt->get_result();
$admin = $result->fetch_assoc();

$valid = false;
if ($admin) {
    if (password_verify($password, $admin["password"])) {
        $valid = true;
    } elseif ($password === $admin["password"]) {
        // Backward support if DB still has plain text password.
        $valid = true;
    }
}

if ($valid) {
    $_SESSION["admin_id"] = $admin["id"];
    $_SESSION["admin_user"] = $admin["username"];
    header("Location: ../dashboard.html");
    exit;
}

header("Location: ../login.html?error=Invalid%20username%20or%20password");
exit;
?>
