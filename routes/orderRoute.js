const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');


router.use(authMiddleware);
// Create a new order
router.post('/orders', orderController.createOrder);

// Get orders for a specific buyer
//router.get('/orders/buyer/:buyer_id', authMiddleware, orderController.getBuyerOrders);

// To this:
router.get('/orders/buyer/:buyer_id', (req, res) => {
    // Use the current user from session instead of param
    orderController.getCurrentBuyerOrders(req, res);
});

// Get orders for a specific seller
router.get('/orders/seller/:seller_id', authMiddleware, orderController.getSellerOrders);

// Get specific order by ID
router.get('/orders/:order_id', authMiddleware, orderController.getOrderById);

// Get pending orders for a seller
router.get('/orders/pending', authMiddleware, orderController.getPendingOrders);

// In your order routes
router.get('/orders/buyer/current', authMiddleware, orderController.getCurrentBuyerOrders);

// Update order status
router.put('/orders/:order_id/status', authMiddleware, orderController.updateOrderStatus);

module.exports = router;