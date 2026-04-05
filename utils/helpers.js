// utils/helpers.js
const db = require("../config/db");

// ✅ Enhanced notifyUser function - saves to database (PostgreSQL version)
const notifyUser = async (userId, title, message) => {
  try {
    console.log(`🔔 Notification to user ${userId}: ${title} - ${message}`);
    
    // Save notification to database - PostgreSQL syntax
    await db.query(
      "INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES ($1, $2, $3, false, NOW())",
      [userId, title, message]
    );
    
    console.log(`✅ Notification saved to database for user ${userId}`);
    return true;
  } catch (error) {
    console.error('❌ Error saving notification:', error);
    return false;
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