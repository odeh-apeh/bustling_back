const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied: Admins only" });
  }
  next();
};

// Admin Auth Routes
router.post("/login", adminController.adminLogin);
router.post("/logout", adminOnly, adminController.adminLogout);
router.get("/profile", adminOnly, adminController.getAdminProfile);

router.get("/pending-deposit", adminOnly, adminController.getPendingDeposits);
router.post("/approve-deposit", adminOnly, adminController.processDeposit);

router.get("/pending-withdrawal", adminController.getPendingWithdrawals);
router.post("/approve-withdrawal", adminController.processWithdrawal);

// Dashboard
router.get("/dashboard", adminOnly, adminController.getDashboardStats);

// User Management
router.get("/users", adminOnly, adminController.getAllUsers);
router.put("/users/:userId", adminOnly, adminController.updateUser);

// Product/Service Management (both in products table)
router.get("/products", adminOnly, adminController.getAllProducts);
router.delete("/products/:productId", adminOnly, adminController.deleteProduct);

// Order Management
router.get("/orders", adminOnly, adminController.getAllOrders);
router.put("/orders/:orderId/status", adminOnly, adminController.updateOrderStatus);

// Dispute Management (disputes are in orders table)
router.get("/disputes", adminOnly, adminController.getAllDisputes);
router.get("/disputes/:disputeId", adminOnly, adminController.getDisputeById);
router.post("/disputes/:disputeId/messages", adminOnly, adminController.addDisputeMessage);
router.put("/disputes/:disputeId/status", adminOnly, adminController.updateDisputeStatus);
router.put("/disputes/:disputeId/resolve", adminOnly, adminController.resolveDispute);

// Wallet & Transactions
router.get("/transactions", adminOnly, adminController.getAllTransactions);

// Escrow Management
router.get("/escrows", adminOnly, adminController.getAllEscrows);
router.post("/release-escrow", adminOnly, adminController.releaseEscrow);
router.post("/refund-escrow", adminOnly, adminController.refundEscrow);

//Info
router.post("/save-admin-details", adminOnly, adminController.saveAdminDetails);
router.post("/update-admin-details", adminOnly, adminController.updateAdminDetails);
router.get("/fetch-admin-details", adminOnly, adminController.fetchAdminDetails);
router.get("/fetch-all-admins", adminOnly, adminController.getAllAdmins);
router.delete("/delete-admin", adminOnly, adminController.deleteAdmin);
router.get("/send-otp/:email", adminOnly, adminController.sendOtp);
router.post("/verify-otp", adminOnly, adminController.verifyCode);
router.get("/find-one", adminOnly, adminController.findOneAdmin);


module.exports = router;