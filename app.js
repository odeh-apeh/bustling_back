// BackApp/app.js - WITH AUTH MIDDLEWARE

const express = require("express");
const db = require("./config/db");
const cors = require("cors");
const session = require("express-session");
const pgSession = require('express-pg-session')(session);
require("dotenv").config();

const app = express();

// ✅ CORS Configuration
app.use(cors({ 
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Session-ID'],
}));

// ✅ PostgreSQL Session Store
const sessionStore = new pgSession({
    conString: process.env.INTERNAL_DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true,
    ttl: 24 * 60 * 60,
    schemaName: 'public',
    pruneSessionInterval: 60,
});

// ✅ Session Middleware
app.use(
    session({
        name: "session_cookie_name",
        secret: process.env.SESSION_SECRET || "supersecret",
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
        },
        rolling: true,
    })
);

// ✅ Debug middleware
app.use((req, res, next) => {
    console.log("🔄 Session ID:", req.session?.id);
    console.log("🔄 User ID:", req.session?.userId);
    next();
});

// ✅ JSON parser
app.use(express.json());

// ✅ Import routes
const authRoutes = require("./routes/auth");
const walletRoutes = require("./routes/wallet");
const adminRoutes = require("./routes/admin");
const productRoutes = require("./routes/product");
const deliveryCompanyRoutes = require("./routes/deliveryCompany");
const deliveryRoutes = require("./routes/delivery");
const userRoutes = require("./routes/user");
const orderRoutes = require('./routes/orderRoute');
const notificationRoutes = require("./routes/notifications");
const transferRoutes = require("./routes/transfer");
const chatRoutes = require("./routes/chat");

// ✅ Import auth middleware
const authMiddleware = require("./middlewares/authMiddleware");

// ✅ Public routes (no authentication required)
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes); // Public product viewing

// ✅ Protected routes (authentication required)
app.use("/api/wallet", authMiddleware, walletRoutes);
app.use("/api/admin", authMiddleware, adminRoutes);
app.use("/api/delivery-company", authMiddleware, deliveryCompanyRoutes);
app.use("/api/delivery", authMiddleware, deliveryRoutes);
app.use("/api/user", authMiddleware, userRoutes);
app.use("/api/notifications", authMiddleware, notificationRoutes);
app.use("/api/transfer", authMiddleware, transferRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);

// ✅ Order routes with specific auth requirements
app.use('/api/orders', authMiddleware, orderRoutes);
app.use('/api', authMiddleware, orderRoutes); // Be careful - this might duplicate routes

// ✅ Serve product uploads (public)
app.use("/uploads", express.static("uploads"));

// ✅ Cron jobs
require("./cronJobs");

// ✅ API root route (public)
app.get('/api', (req, res) => {
    if (res.headersSent) return;
    res.json({ 
        success: true, 
        message: 'Errandly API is running!',
        version: '1.0'
    });
});

// ✅ Root route (public)
app.get('/', (req, res) => {
    if (res.headersSent) return;
    res.json({ 
        success: true, 
        message: 'Errandly Backend Server is running!'
    });
});

// ✅ 404 handler - MUST be BEFORE error handler
app.use((req, res, next) => {
    if (res.headersSent) return next();
    res.status(404).json({ 
        success: false,
        message: `Cannot ${req.method} ${req.originalUrl} - Route not found`
    });
});

// ✅ Error handler - MUST be LAST
app.use((err, req, res, next) => {
    // Log the error
    console.error("❌ Unhandled Error:", err.message);
    console.error("❌ Error stack:", err.stack);
    
    // Check if headers already sent
    if (res.headersSent) {
        console.error("Headers already sent, cannot send error response");
        return next(err);
    }
    
    // Send error response
    res.status(500).json({ 
        success: false,
        message: "Internal Server Error",
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ✅ Server listen
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Auth middleware enabled on protected routes`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});