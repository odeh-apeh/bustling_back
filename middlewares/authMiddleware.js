// backend/middleware/authMiddleware.js
module.exports = (req, res, next) => {
    console.log("🔍 Auth Middleware - Checking session:", req.session);
    
    if (req.session && req.session.userId !== undefined) {
        // Convert userId to number if it's a string
        const userId = typeof req.session.userId === 'string' 
            ? parseInt(req.session.userId, 10) 
            : req.session.userId;
        
        if (isNaN(userId)) {
            console.log("❌ Invalid userId in session:", req.session.userId);
            return res.status(401).json({ 
                success: false,
                message: "Invalid session. Please log in again." 
            });
        }
        
        // Attach user info to req.user as number
        req.user = {
            userId: userId,
        };
        console.log("✅ User authenticated. userId:", req.user.userId, "Type:", typeof req.user.userId);
        return next();
    } else {
        console.log("❌ No session userId found");
        return res.status(401).json({ 
            success: false,
            message: "Unauthorized. Please log in." 
        });
    }
};