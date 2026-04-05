const bcrypt = require('bcryptjs');
const db = require('../config/db');

//user registration
exports.register = async (req, res) => {
    try {
        const { name, phone, email, password, type, location } = req.body

        //check for required fields
        if (!name || !phone || !password) {
            return res.status(400).json({message: "These fields are required"})
        }

        //check if user exists
        const existing = await db.query("SELECT id FROM users WHERE phone = $1", [phone]);
        if (existing.rows.length > 0) {
            return res.status(400).json({message: "Phone number already registered"});
        }

        //hash the password
        const hashPassword = await bcrypt.hash(password, 10);

        //insert user - PostgreSQL uses RETURNING id instead of insertId
        const result = await db.query(
            "INSERT INTO users (name, phone, email, password, type, location) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", 
            [name, phone, email, hashPassword, type, location]
        );
        const userId = result.rows[0].id;

        //create wallet with balance
        await db.query("INSERT INTO wallet (user_id, balance) VALUES ($1, 0.00)", [userId]);
        res.status(201).json({ success: true, message: "User registered successfully"});
    } catch (err) {
        console.error("Registration error", err);
        res.status(500).json({message: "Server error"});
    }
};

//The login route - FIXED with session save
exports.login = async (req, res) => {
    try {
        const {phone, password} = req.body;
        if(!phone || !password) {
            return res.status(400).json({message: "Phone and password required"});
        }

        console.log("🔍 Login attempt for phone:", phone);

        //Find user
        const result = await db.query("SELECT * FROM users WHERE phone = $1", [phone]);
        if(result.rows.length === 0) {
            console.log("❌ User not found:", phone);
            return res.status(400).json({message: "Invalid credentials"});
        }

        const user = result.rows[0];
        console.log("✅ User found:", user.id, user.name);

        //compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log("❌ Password mismatch for user:", phone);
            return res.status(400).json({message: "Invalid credentials"});
        }

        //start session - FIX: Set userId and save session
        req.session.userId = parseInt(user.id, 10);
        
        // Also set user object for convenience
        req.session.user = {
            id: user.id,
            name: user.name,
            phone: user.phone,
            email: user.email,
            role: user.role || 'user'
        };
        
        // ✅ CRITICAL FIX: Save session explicitly to ensure it's persisted
        req.session.save((err) => {
            if (err) {
                console.error("❌ Session save error:", err);
                return res.status(500).json({ 
                    success: false, 
                    message: "Login failed: Could not save session" 
                });
            }
            
            console.log("✅ Session saved successfully. userId:", req.session.userId);
            console.log("✅ Session ID:", req.session.id);
            
            res.json({ 
                success: true, 
                message: "Login successful", 
                userId: user.id, 
                phone: user.phone,
                name: user.name,
                role: user.role
            });
        });
        
    } catch (err){
        console.error("Login error", err);
        res.status(500).json({message: "Server error"})
    }
};

//user logout
exports.logout = (req, res) => {
    // Destroy session
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).json({message: "Server error"});
        }
        
        // Clear the cookie
        res.clearCookie("session_cookie_name");
        
        console.log("✅ User logged out successfully");
        res.json({ 
            success: true,
            message: "Logout successful" 
        });
    });
};

// Get current user info - FIXED with better error handling
exports.getCurrentUser = async (req, res) => {
    try {
        console.log("🔍 getCurrentUser - Session ID:", req.session?.id);
        console.log("🔍 getCurrentUser - userId:", req.session?.userId);
        
        // Check if user is logged in via session
        if (!req.session || !req.session.userId) {
            console.log("❌ No userId in session");
            return res.status(401).json({ 
                success: false, 
                message: "Not authenticated. Please login." 
            });
        }

        const userId = req.session.userId;
        console.log("✅ Fetching user from DB for ID:", userId);
        
        // Fetch user from database
        const result = await db.query(
            "SELECT id, name, phone, email, type, location, role FROM users WHERE id = $1", 
            [userId]
        );
        
        if (result.rows.length === 0) {
            console.log("❌ User not found in database:", userId);
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        const user = result.rows[0];
        console.log("✅ User found:", user.name);
        
        res.json({ 
            success: true, 
            user: user 
        });
    } catch (err) {
        console.error("Get current user error:", err);
        res.status(500).json({ 
            success: false, 
            message: "Server error" 
        });
    }
};

// ✅ ADD THIS: Check authentication status (useful for debugging)
exports.checkAuth = async (req, res) => {
    console.log("🔍 checkAuth - Session:", req.session);
    console.log("🔍 checkAuth - Session ID:", req.session?.id);
    console.log("🔍 checkAuth - userId:", req.session?.userId);
    
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ 
            authenticated: false,
            message: "Not authenticated" 
        });
    }
    
    // Verify user still exists
    try {
        const result = await db.query(
            "SELECT id, name, phone, email, role FROM users WHERE id = $1",
            [req.session.userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                authenticated: false,
                message: "User no longer exists" 
            });
        }
        
        res.json({ 
            authenticated: true,
            user: result.rows[0],
            sessionId: req.session.id
        });
    } catch (error) {
        console.error("Check auth error:", error);
        res.status(500).json({ 
            authenticated: false,
            message: "Error checking authentication" 
        });
    }
};