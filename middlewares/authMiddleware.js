// middlewares/authMiddleware.js
const db = require("../config/db");

module.exports = async (req, res, next) => {
    console.log("🔍 Auth Middleware - Checking session:", req.session);
    console.log("🔍 Auth Middleware - userId:", req.session?.userId);
    
    // Check if user is logged in via session
    if (!req.session || !req.session.userId) {
        console.log("❌ No session userId found");
        return res.status(401).json({ 
            success: false,
            message: "Unauthorized. Please login first." 
        });
    }

    try {
        // Convert userId to number if it's a string
        let userId = req.session.userId;
        if (typeof userId === 'string') {
            userId = parseInt(userId, 10);
        }
        
        if (isNaN(userId)) {
            return res.status(401).json({ 
                success: false,
                message: "Invalid session. Please login again." 
            });
        }
        
        // Verify user still exists in database
        const result = await db.query(
            "SELECT id, name, phone, email, role, is_blocked FROM users WHERE id = $1",
            [userId]
        );
        
        if (result.rows.length === 0) {
            console.log("❌ User not found in database:", userId);
            return res.status(401).json({ 
                success: false,
                message: "User not found. Please login again." 
            });
        }
        
        const user = result.rows[0];
        
        // Check if user is blocked
        if (user.is_blocked) {
            console.log("❌ User is blocked:", userId);
            return res.status(403).json({ 
                success: false,
                message: "Your account has been blocked. Please contact support." 
            });
        }
        
        // ✅ Attach user to request
        req.user = user;
        req.user.userId = user.id; // Ensure userId is set
        req.userId = user.id;
        
        console.log("✅ Auth successful for user:", user.id, user.name);
        next();
    } catch (error) {
        console.error("❌ Auth middleware error:", error);
        return res.status(500).json({ 
            success: false,
            message: "Authentication error" 
        });
    }
};

module.exports.admin = async (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ 
            success: false,
            message: "Unauthorized" 
        });
    }

    try {
        const result = await db.query(
            "SELECT role FROM users WHERE id = $1",
            [req.session.userId]
        );
        
        if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: "Admin access required" 
            });
        }
        
        next();
    } catch (error) {
        console.error("Admin middleware error:", error);
        return res.status(500).json({ 
            success: false,
            message: "Authentication error" 
        });
    }
};