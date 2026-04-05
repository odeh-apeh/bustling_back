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

//The login route
exports.login = async (req, res) => {
    try {
        const {phone, password} = req.body;
        if(!phone || !password) {
            return res.status(400).json({message: "Phone and password required"});
        }

        //Find user
        const result = await db.query("SELECT * FROM users WHERE phone = $1", [phone]);
        if(result.rows.length === 0) {
            return res.status(400).json({message: "Invalid credentials"});
        }

        const user = result.rows[0];

        //compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({message: "Invalid credentials"});
        }

        //start session
        req.session.userId = parseInt(user.id, 10);

        res.json({ success: true, message: "Login successful", userId: user.id, phone: user.phone});
    } catch (err){
        console.error("Login error", err);
        res.status(500).json({message: "Server error"})
    }
};

//user logout
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).json({message: "Server error"});
        }
        res.clearCookie("session_cookie_name");
        res.json({message: "Logout successful"});
    });
};

// Get current user info
exports.getCurrentUser = async (req, res) => {
  try {
    // Check if user is logged in via session
    if (!req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        message: "Not authenticated" 
      });
    }

    const userId = req.session.userId;
    
    // Fetch user from database
    const result = await db.query(
      "SELECT id, name, phone, email, type, location FROM users WHERE id = $1", 
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    const user = result.rows[0];
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