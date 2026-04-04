const StreamChat = require('stream-chat').StreamChat;
const db = require('../config/db'); // Add this line to import your database connection

class ChatController {
  constructor() {
    this.client = StreamChat.getInstance(
      process.env.STREAM_API_KEY,
      process.env.STREAM_API_SECRET
    );
  }

  // Helper method to fetch user from database
  // Update the fetchUserFromDB method in chatController.js
async fetchUserFromDB(userId) {
  try {
    console.log(`🔍 Fetching user ${userId} from database...`);
    
    const [rows] = await db.execute(
      'SELECT id, name, image, phone, location FROM users WHERE id = ?',
      [userId]
    );
    
    console.log(`📊 User ${userId} query result:`, rows);
    
    if (rows.length > 0) {
      return rows[0];
    } else {
      console.log(`❌ User ${userId} not found in database`);
      return null;
    }
  } catch (error) {
    console.log(`⚠️ Database error for user ${userId}:`, error.message);
    console.log(`⚠️ SQL error code:`, error.code);
    console.log(`⚠️ SQL error sqlMessage:`, error.sqlMessage);
    return null;
  }
}

  // Add this method to your ChatController class
async fetchProductFromDB(productId) {
  try {
    console.log(`🔍 Fetching product ${productId} from database...`);
    
    const [rows] = await db.execute(
      'SELECT id, name, price FROM products WHERE id = ?',
      [productId]
    );
    
    console.log(`📊 Product ${productId} query result:`, rows);
    
    if (rows.length > 0) {
      return rows[0];
    } else {
      console.log(`❌ Product ${productId} not found in database`);
      return null;
    }
  } catch (error) {
    console.log(`⚠️ Database error for product ${productId}:`, error.message);
    console.log(`⚠️ SQL error code:`, error.code);
    console.log(`⚠️ SQL error sqlMessage:`, error.sqlMessage);
    return null;
  }
}

  // UPDATE the upsertUser method
  async upsertUser(userId, userData = {}) {
    try {
      console.log("🔄 Upserting user in Stream Chat:", userId);
      
      // Fetch user from database if we don't have name
      let userName = userData.name;
      let userImage = userData.image;
      let userLocation = userData.location;
      
      if (!userName) {
        const dbUser = await this.fetchUserFromDB(userId);
        if (dbUser) {
          userName = dbUser.name || `User ${userId}`;
          userImage = dbUser.image || null;
          userLocation = dbUser.location || 'Unknown';
        } else {
          userName = `User ${userId}`;
        }
      }
      
      const response = await this.client.upsertUser({
        id: String(userId),
        name: userName,
        role: 'user',
        image: userImage,
        location: userLocation,
        ...userData
      });
      
      console.log("✅ User upserted:", userName);
      return response;
    } catch (error) {
      console.error('❌ Error upserting user:', error);
      throw error;
    }
  }

  // Generate token for user
  async generateToken(userId) {
    try {
      console.log("🔄 Generating Stream token for userId:", userId);
      
      // First, ensure user exists in Stream with proper data
      await this.upsertUser(userId);
      
      const token = this.client.createToken(userId);
      
      return {
        token,
        userId: userId,
        apiKey: process.env.STREAM_API_KEY
      };
    } catch (error) {
      console.error('❌ Error generating token:', error);
      throw error;
    }
  }

  // Create or get channel between buyer and seller
  // Create or get channel between buyer and seller
async getOrCreateChannel(buyerId, sellerId, productId, additionalData = {}) {
  try {
    console.log("🔄 Creating channel with:", { buyerId, sellerId, productId });
    
    // 1. Fetch user data from database USING RAW SQL (not Sequelize)
    const [buyerRows] = await db.execute(
      'SELECT id, name, image, location FROM users WHERE id = ?',
      [buyerId]
    );
    const [sellerRows] = await db.execute(
      'SELECT id, name, image, location FROM users WHERE id = ?',
      [sellerId]
    );
    const [productRows] = await db.execute(
      'SELECT id, name, price FROM products WHERE id = ?',
      [productId]
    );
    
    const buyer = buyerRows[0];
    const seller = sellerRows[0];
    const product = productRows[0];
    
    // 2. Ensure BOTH users exist in Stream with proper data
    await this.upsertUser(buyerId, {
      name: buyer?.name || `User ${buyerId}`,
      image: buyer?.image,
      location: buyer?.location || 'Unknown'
    });
    
    await this.upsertUser(sellerId, {
      name: seller?.name || `User ${sellerId}`,
      image: seller?.image,
      location: seller?.location || 'Unknown'
    });
    
    // 3. Create unique channel ID
    const channelId = `commerce_${productId}_${buyerId}_${sellerId}`;
    
    // 4. Create channel with all necessary data
    const channel = this.client.channel('commerce', channelId, {
      name: product?.name || `Chat for Product ${productId}`,
      members: [buyerId, sellerId],
      created_by_id: buyerId,
      product_id: productId,
      product_name: product?.name || 'Product',
      product_image: product?.image || null,
      buyer_id: buyerId,
      buyer_name: buyer?.name || `User ${buyerId}`,
      buyer_image: buyer?.image,
      seller_id: sellerId,
      seller_name: seller?.name || `User ${sellerId}`,
      seller_image: seller?.image,
      seller_location: seller?.location || 'Unknown',
      ...additionalData
    });
    
    // 5. Create the channel
    await channel.create();
    console.log("✅ Channel created:", channelId);
    
    return {
      channelId,
      buyerName: buyer?.name || `User ${buyerId}`,
      sellerName: seller?.name || `User ${sellerId}`,
      productName: product?.name || 'Product',
      success: true
    };
  } catch (error) {
    console.error('❌ Error creating channel:', error);
    
    if (error.code === 16) {
      console.log("ℹ️ Channel already exists");
      // Try to update existing channel with missing data
      try {
        const channel = this.client.channel('commerce', `commerce_${productId}_${buyerId}_${sellerId}`);
        await channel.updatePartial({
          set: {
            product_name: additionalData.productName || 'Product',
            seller_name: additionalData.sellerName || `User ${sellerId}`
          }
        });
      } catch (updateError) {
        console.log("⚠️ Could not update existing channel:", updateError.message);
      }
      
      return {
        channelId: `commerce_${productId}_${buyerId}_${sellerId}`,
        buyerName: `User ${buyerId}`,
        sellerName: additionalData.sellerName || `User ${sellerId}`,
        productName: additionalData.productName || 'Product',
        success: true,
        exists: true
      };
    }
    
    // Add more specific error handling
    if (error.response) {
      console.error('Stream API Response:', error.response.data);
    }
    
    throw new Error(`Failed to create chat channel: ${error.message}`);
  }
}

  // Get user's channels with proper user names
  // Update the getUserChannels method
async getUserChannels(userId) {
  try {
    console.log("🔄 Getting channels for user:", userId);
    
    const filter = { 
      type: 'commerce', 
      members: { $in: [userId] } 
    };
    const sort = [{ last_message_at: -1 }];
    
    const channels = await this.client.queryChannels(filter, sort, {
      watch: false,
      state: false
    });
    
    // Process channels
    const conversations = await Promise.all(channels.map(async (channel) => {
      const channelData = channel.data || {};
      
      // Get IDs
      const sellerId = channelData.seller_id || '';
      const buyerId = channelData.buyer_id || '';
      const productId = channelData.product_id || '';
      
      // Determine if current user is buyer or seller
      const isBuyer = userId === buyerId;
      const otherUserId = isBuyer ? sellerId : buyerId;
      
      // Try to get names from channel data first
      let otherUserName = isBuyer 
        ? (channelData.seller_name || `User ${otherUserId}`)
        : (channelData.buyer_name || `User ${otherUserId}`);
      
      let productName = channelData.product_name || 'Product';
      
      // If names are not in channel data, fetch from database
      if (otherUserName.includes('User ') && otherUserId) {
        const otherUser = await this.fetchUserFromDB(otherUserId);
        if (otherUser && otherUser.name) {
          otherUserName = otherUser.name;
        }
      }
      
      if (productName === 'Product' && productId) {
        const product = await this.fetchProductFromDB(productId);
        if (product && product.name) {
          productName = product.name;
        }
      }
      
      // Get last message
      let lastMessage = "No messages yet";
      if (channelData.last_message) {
        lastMessage = typeof channelData.last_message === 'string' 
          ? channelData.last_message 
          : (channelData.last_message.text || "No messages yet");
      }
      
      return {
        channelId: channel.id,
        otherUserId: otherUserId,
        otherUserName: otherUserName,
        productId: productId,
        productName: productName,
        sellerId: sellerId,
        buyerId: buyerId,
        lastMessage: lastMessage,
        lastMessageAt: channelData.last_message_at || channelData.created_at,
        unreadCount: 0,
        createdAt: channelData.created_at
      };
    }));
    
    console.log("✅ Found", conversations.length, "conversations");
    console.log("👥 Conversations data:", conversations);
    return conversations;
    
  } catch (error) {
    console.error('❌ Error getting user channels:', error.message);
    return [];
  }
}

  // Add message
  async sendMessage(channelId, userId, text) {
    try {
      const channel = this.client.channel('commerce', channelId);
      
      const message = await channel.sendMessage({
        text,
        user_id: userId
      });
      
      return { success: true, message };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }
}

module.exports = new ChatController();