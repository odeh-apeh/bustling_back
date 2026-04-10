// routes/deliveryCompany.js
const express = require("express");
const router = express.Router();
const deliveryCompanyController = require("../controllers/deliveryCompanyController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/register", authMiddleware, deliveryCompanyController.registerDeliveryCompany);
// In your routes file
router.put('/api/delivery/company/:id', authMiddleware, deliveryCompanyController.updateDeliveryCompany);
router.delete('/api/delivery/company/:id', authMiddleware, deliveryCompanyController.deleteDeliveryCompany);
router.delete('/api/delivery/company/:id/soft', authMiddleware, deliveryCompanyController.softDeleteDeliveryCompany);
router.delete('/api/delivery/company/:id/hard', authMiddleware, deliveryCompanyController.hardDeleteDeliveryCompany);
router.get('/api/delivery/company/:id', authMiddleware, deliveryCompanyController.getDeliveryCompanyById);

module.exports = router;
