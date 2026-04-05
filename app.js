// BackApp/app.js

const express = require("express");
const db = require("./config/db");
const cors = require("cors");
const session = require("express-session");
const pgSession = require('express-pg-session')(session); // ✅ Using express-pg-session
require("dotenv").config();

const walletController = require("./controllers/walletController");

const app = express();

// ✅ CORS Configuration for Mobile App
app.use(cors({ 
    origin: true, // Allow all origins for mobile app
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Session-ID'],
}));

// ⚠️ IMPORTANT: Put webhooks BEFORE express.json()
// Because Paystack needs the raw body to compute signature
/*app.post("/api/wallet/webhook", 
  express.raw({ type: "application/json" }),
  (req, res) => {
    const event = req.body.event;
    
    if (event.includes('charge.')) {
      walletController.verifyPayment(req, res);
    } else if (event.includes('transfer.')) {
      walletController.verifyTransfer(req, res);
    } else {
      res.sendStatus(200);
    }
  }
);
*/

// ✅ PostgreSQL Session Store with express-pg-session
const sessionStore = new pgSession({
    conString: process.env.INTERNAL_DATABASE_URL, // Use your PostgreSQL connection string
    tableName: 'session',
    createTableIfMissing: true,
    ttl: 24 * 60 * 60, // 1 day in seconds
    schemaName: 'public',
    pruneSessionInterval: 60, // Prune expired sessions every 60 seconds
});

// ✅ Session Middleware - MUST come before routes
app.use(
    session({
        name: "session_cookie_name",
        secret: process.env.SESSION_SECRET || "supersecret",
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24, // 1 day
            httpOnly: true,
            secure: false, // Set to false for HTTP (development)
            sameSite: 'lax',
            path: '/',
        },
        // Keep session alive with activity
        rolling: true,
    })
);

// ✅ Debug middleware to log session (useful for debugging)
app.use((req, res, next) => {
    console.log("🔄 Session Debug - ID:", req.session?.id);
    console.log("🔄 Session Debug - userId:", req.session?.userId);
    console.log("🔄 Session Debug - Cookie header:", req.headers.cookie);
    next();
});

// ✅ JSON parser for all routes (after session middleware)
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

const authMiddleware = require("./middlewares/authMiddleware");

// ✅ Use routes
app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/delivery-company", deliveryCompanyRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/user", userRoutes);
app.use('/api', orderRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/transfer", transferRoutes);
app.use("/api/chat", chatRoutes);

// ✅ Serve product uploads
app.use("/uploads", express.static("uploads"));

// ✅ Cron jobs
require("./cronJobs");

// ✅ Add API root route
app.get('/api', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Errandly API is running!',
        version: '1.0',
        endpoints: {
            auth: '/api/auth',
            user: '/api/user', 
            wallet: '/api/wallet',
            products: '/api/products'
        }
    });
});

// ✅ Also add a simple root route
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Errandly Backend Server is running!',
        api: 'Visit /api for available endpoints'
    });
});

// ✅ Error handler fallback
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ 
        success: false,
        message: "Internal Server Error",
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// // ✅ 404 handler for undefined routes
// app.use('*', (req, res) => {
//     res.status(404).json({ 
//         success: false,
//         message: `Cannot ${req.method} ${req.originalUrl} - Route not found`
//     });
// });

// ✅ Server listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Session secure: false (HTTP mode)`);
    console.log(`📦 Session store: express-pg-session`);
});