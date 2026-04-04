// utils/helpers.js
const db = require("../config/db");

// ✅ Enhanced notifyUser function - saves to database
const notifyUser = async (userId, title, message) => {
  try {
    console.log(`🔔 Notification to user ${userId}: ${title} - ${message}`);
    
    // Save notification to database
    await db.execute(
      "INSERT INTO notifications (user_id, message, is_read) VALUES (?, ?, ?)",
      [userId, `${title}: ${message}`, 0]
    );
    
    console.log(`✅ Notification saved to database for user ${userId}`);
  } catch (error) {
    console.error('❌ Error saving notification:', error);
  }
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Earth's radius in km

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in km
};

module.exports = { notifyUser, calculateDistance };