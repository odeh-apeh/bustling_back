// BackApp/app.js

const express = require("express");
const db = require("./config/db");
const cors = require("cors");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session); // ✅ PostgreSQL session store
require("dotenv").config();

const walletController = require("./controllers/walletController");

const app = express();

// ✅ Middleware
app.use(cors({ 
    origin: '*', // Mobile apps don't have an origin, so allow all
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
// ✅ Now JSON parser for all other routes
app.use(express.json());

// ✅ PostgreSQL Session Store
const sessionStore = new PgSession({
    pool: db.pool,
    tableName: 'session',
    createTableIfMissing: true,
    pruneSessionInterval: 60, // Prune expired sessions every 60 seconds
    errorLog: console.error,
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
            secure: process.env.NODE_ENV === "production", // true only in production (HTTPS)
            sameSite: 'lax',
            path: '/',
        },
        // Keep session alive with activity
        rolling: true,
    })
);

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
app.use("/api/transfer", transferRoutes)
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
  res.status(500).json({ message: "Internal Server Error" });
});

// ✅ Server listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});