// backend/routes/profile.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');
const bcrypt = require('bcryptjs');

// Get user profile with wallet info
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user data
    const [userRows] = await db.execute(
      "SELECT id, name, phone, email, type, location FROM users WHERE id = ?", 
      [userId]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Get wallet data
    const [walletRows] = await db.execute(
      "SELECT balance FROM wallet WHERE user_id = ?", 
      [userId]
    );

    // Get user stats
    const [orderStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN type = 'product' THEN 1 ELSE 0 END) as product_orders,
        SUM(CASE WHEN type = 'service' THEN 1 ELSE 0 END) as service_orders
      FROM orders 
      WHERE buyer_id = ?
    `, [userId]);

    const [sellerStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_listings,
        SUM(CASE WHEN type = 'product' THEN 1 ELSE 0 END) as products_listed,
        SUM(CASE WHEN type = 'service' THEN 1 ELSE 0 END) as services_listed
      FROM products 
      WHERE seller_id = ?
    `, [userId]);
    
    res.json({
      success: true,
      user: userRows[0],
      wallet: walletRows[0] || { balance: 0.00 },
      stats: {
        totalOrders: orderStats[0]?.total_orders || 0,
        productOrders: orderStats[0]?.product_orders || 0,
        serviceOrders: orderStats[0]?.service_orders || 0,
        totalListings: sellerStats[0]?.total_listings || 0,
        productsListed: sellerStats[0]?.products_listed || 0,
        servicesListed: sellerStats[0]?.services_listed || 0,
      }
    });
    
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { name, email, location } = req.body;

    if (!name && !email && !location) {
      return res.status(400).json({ 
        success: false, 
        message: "No fields to update" 
      });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (name) {
      updates.push("name = ?");
      params.push(name);
    }
    if (email) {
      updates.push("email = ?");
      params.push(email);
    }
    if (location) {
      updates.push("location = ?");
      params.push(location);
    }

    params.push(userId);

    const query = `
      UPDATE users 
      SET name = ?, email = ?, location = ?
      WHERE id = ?
    `;
    
    const [result] = await db.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Get updated user data
    const [userRows] = await db.execute(
      "SELECT id, name, phone, email, type, location FROM users WHERE id = ?", 
      [userId]
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: userRows[0]
    });

  } catch (err) {
    console.error("Update profile error:", err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        success: false, 
        message: "Email already exists" 
      });
    }
    
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Reset password
router.put('/reset-password', authMiddleware, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Current password and new password are required" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: "New password must be at least 6 characters" 
      });
    }

    // Get current password hash
    const [userRows] = await db.execute(
      "SELECT password FROM users WHERE id = ?", 
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, userRows[0].password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.execute(
      "UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 
      [hashedPassword, userId]
    );

    res.json({
      success: true,
      message: "Password updated successfully"
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;