// backend/routes/chat.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddleware');

// Generate token for user
router.post('/token', authMiddleware, async (req, res) => {
  try {
    console.log("🔑 Generating token for user:", req.user);
    
    // Make sure userId exists and is a string
    if (!req.user || !req.user.userId) {
      return res.status(400).json({ 
        success: false, 
        error: "User ID not found in session" 
      });
    }
    
    const userId = String(req.user.userId); // Convert to string
    const tokenData = await chatController.generateToken(userId);
    
    res.json({
      success: true,
      userId: userId,
      ...tokenData
    });
  } catch (error) {
    console.error("❌ Token generation error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create or get chat channel
// In routes/chat.js
router.post('/channel', authMiddleware, async (req, res) => {
  try {
    console.log("🔄 Creating channel with data:", req.body);
    
    const { sellerId, productId, productName, sellerName, sellerImage } = req.body;
    
    if (!req.user || !req.user.userId) {
      return res.status(400).json({ 
        success: false, 
        error: "Buyer ID not found in session" 
      });
    }
    
    const buyerId = String(req.user.userId);
    
    const channelData = await chatController.getOrCreateChannel(
      buyerId,
      sellerId,
      productId,
      {
        productName: productName,
        sellerName: sellerName,
        sellerImage: sellerImage
      }
    );
    
    res.json({
      success: true,
      ...channelData
    });
  } catch (error) {
    console.error("❌ Channel creation error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get user's chat channels
// routes/chat.js - Update the /channels endpoint
router.get('/channels', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(400).json({ 
        success: false, 
        error: "User ID not found" 
      });
    }
    
    const userId = String(req.user.userId);
    const conversations = await chatController.getUserChannels(userId);
    
    // Return in the expected format for frontend
    res.json({ 
      success: true,
      conversations: conversations // Make sure it's "conversations" not "channels"
    });
  } catch (error) {
    console.error("❌ Get channels error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get user's conversations (for MessageScreen)
/*router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(400).json({ 
        success: false, 
        error: "User ID not found" 
      });
    }
    
    const userId = String(req.user.userId);
    const conversations = await chatController.getUserChannels(userId);
    
    res.json({ 
      success: true,
      conversations 
    });
  } catch (error) {
    console.error("❌ Get conversations error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});*/

module.exports = router;