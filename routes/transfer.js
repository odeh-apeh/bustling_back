// backend/routes/transfer.js
const express = require("express");
const router = express.Router();
const transferController = require("../controllers/transferController");
const authMiddleware = require("../middlewares/authMiddleware");

// Transfer routes
router.get("/test", (req, res) => {
  console.log("✅ Transfer routes are loaded!");
  res.json({
    success: true,
    message: "Transfer routes are working",
    timestamp: new Date().toISOString()
  });
});

router.get("/lookup", authMiddleware, transferController.lookupUser);
router.post("/initiate", authMiddleware, transferController.initiateTransfer);
router.get("/history", authMiddleware, transferController.getTransferHistory);
router.get("/:transferId", authMiddleware, transferController.getTransferDetails);

module.exports = router;