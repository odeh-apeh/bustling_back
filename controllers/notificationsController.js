const database = require('../database/database-handler');

exports.getNotifications = async (req, res) => {
  try {
    const {userId} = req.body;

    const notifications = await database.findAll({
      table: 'notifications',
      attribute: 'user_id',
      attributeValue: Number(userId),
      hasAttribute: true
    });

    if (!notifications) {
      return res.status(500).json({
        success: false,
        message: "Error fetching notifications",
        data: null
      });
    }

    res.json({
      success: true,
      message: "Notifications fetched successfully",
      data:
      notifications
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching notifications"
    });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notificationId = req.params.id;
    const {userId} = req.body;

    const updated = await database.updateById({
      table: 'notifications',
      data: {
        is_read: true
      },
      attribute: ['id', 'user_id'],
      attributeValue: [notificationId, userId]
    });

    if (!updated) {
      return res.status(500).json({
        success: false,
        message: "Error updating notification"
      });
    }

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
};