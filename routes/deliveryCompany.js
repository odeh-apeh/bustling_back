// routes/deliveryCompany.js
const express = require("express");
const router = express.Router();
const deliveryCompanyController = require("../controllers/deliveryCompanyController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/register", authMiddleware, deliveryCompanyController.registerDeliveryCompany);

module.exports = router;
