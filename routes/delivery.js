const express = require("express");
const router = express.Router();
const deliveryController = require("../controllers/deliveryController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get(
  "/companies",
  authMiddleware,
  deliveryController.getAvailableDeliveryCompanies
);
router.post("/get-company-by-id", authMiddleware, deliveryController.getDeliveryCompanyById);
router.post("/request", authMiddleware, deliveryController.requestDelivery);
router.post("/confirm", authMiddleware, deliveryController.confirmDelivery);


module.exports = router;
