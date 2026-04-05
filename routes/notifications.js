// routes/notifications.js
const express = require("express");
const router = express.Router();
const db = require("../config/db"); // should be a pg Pool or Client instance
const authMiddleware = require("../middlewares/authMiddleware");

// ✅ Get user's notifications
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.session.userId;

    const { rows: notifications } = await db.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching notifications"
    });
  }
});

// ✅ Mark notification as read
router.put("/:id/read", authMiddleware, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.session.userId;

    await db.query(
      "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2",
      [notificationId, userId]
    );

    res.json({
      success: true,
      message: "Notification marked as read"
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: "Error updating notification"
    });
  }
});

module.exports = router;