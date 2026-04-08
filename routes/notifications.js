// routes/notifications.js
const express = require("express");
const router = express.Router();
const db = require("../config/db"); // should be a pg Pool or Client instance
const authMiddleware = require("../middlewares/authMiddleware");
const {getNotifications, markAsRead} = require('../controllers/notificationsController');

// ✅ Get user's notifications
router.post("/get-notifications", authMiddleware, getNotifications)
// ✅ Mark notification as read
router.put("/:id/read", authMiddleware, markAsRead);
module.exports = router;