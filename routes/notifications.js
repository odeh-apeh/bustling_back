// routes/notifications.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");
const authMiddleware = require("../middlewares/authMiddleware");

// ✅ Get user's notifications
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.session.userId;

    const [notifications] = await db.execute(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
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

    await db.execute(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
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