const db = require('../config/db');

// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const {
      buyer_id,
      seller_id,
      product_id,
      service_id,
      type,
      quantity = 1,
      total, // Changed from total_price to total
      shipping_address,
      payment_method,
      notes
    } = req.body;

    // Validate required fields
    if (!buyer_id || !seller_id || !total || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: buyer_id, seller_id, total, type'
      });
    }

    // Validate type
    if (!['product', 'service'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "product" or "service"'
      });
    }

    const query = `
      INSERT INTO orders 
      (buyer_id, seller_id, product_id, service_id, type, quantity, total, shipping_address, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.execute(query, [
      buyer_id,
      seller_id,
      product_id || null,
      service_id || null,
      type,
      quantity,
      total, // Changed from total_price to total
      shipping_address,
      payment_method,
      notes
    ]);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        id: result.insertId,
        buyer_id,
        seller_id,
        product_id,
        service_id,
        type,
        quantity,
        total // Changed from total_price to total
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
};


// Get pending orders for a seller
// Get pending orders for a seller - FIX order_date issue
exports.getPendingOrders = async (req, res) => {
  try {
    const { seller_id } = req.query;

    if (!seller_id) {
      return res.status(400).json({
        success: false,
        message: 'seller_id query parameter is required'
      });
    }

    const query = `
      SELECT o.*, 
             p.name as product_name, 
             p.image_url as product_image,
             u.name as buyer_name,
             u.location as buyer_location
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = ? AND o.status = 'pending'
      ORDER BY o.created_at DESC  -- ✅ FIXED: Use created_at
    `;

    const [orders] = await db.execute(query, [parseInt(seller_id, 10)]);

    res.json({
      success: true,
      orders: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending orders',
      error: error.message
    });
  }
};

// Unified seller orders function - FIX order_date issue
exports.getSellerOrders = async (req, res) => {
  try {
    const { seller_id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offsetNum = (pageNum - 1) * limitNum;

    let query = `
      SELECT 
        o.*, 
        p.name as product_name, 
        p.image_url as product_image,
        p.price as unit_price,
        u.name as buyer_name,
        u.email as buyer_email,
        u.phone as buyer_phone,
        u.location as buyer_location
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.buyer_id = u.id
      WHERE o.seller_id = ?
    `;

    const params = [parseInt(seller_id, 10)]; // ✅ Ensure number

    if (status && status !== 'all') {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?'; // ✅ FIXED: Use created_at
    params.push(limitNum, offsetNum); // ✅ Ensure numbers

    const [orders] = await db.execute(query, params);

    // Format the response
    const formattedOrders = orders.map(order => ({
      id: order.id,
      product: {
        id: order.product_id,
        name: order.product_name,
        image: order.product_image,
        price: parseFloat(order.unit_price)
      },
      buyer: {
        id: order.buyer_id,
        name: order.buyer_name,
        email: order.buyer_email,
        phone: order.buyer_phone,
        location: order.buyer_location
      },
      quantity: order.quantity,
      total: parseFloat(order.total_price || order.total),
      status: order.status,
      order_date: order.created_at, // ✅ Use created_at directly
      shipping_address: order.shipping_address,
      payment_method: order.payment_method,
      notes: order.notes,
      type: order.type
    }));

    res.json({
      success: true,
      orders: formattedOrders,
      count: formattedOrders.length,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: formattedOrders.length
      }
    });
  } catch (error) {
    console.error('Error fetching seller orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

// Get orders for a buyer
// Get orders for a specific buyer
exports.getBuyerOrders = async (req, res) => {
  try {
    let { buyer_id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    console.log('🔍 getBuyerOrders called with buyer_id:', buyer_id);
    
    // Convert to number safely
    buyer_id = parseInt(buyer_id, 10);
    
    if (isNaN(buyer_id) || buyer_id <= 0) {
        console.error("❌ Invalid buyer_id:", req.params.buyer_id);
        return res.status(400).json({
        success: false,
        message: "Invalid buyer_id supplied"
      });
    }
    
    // Convert to numbers
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offsetNum = (pageNum - 1) * limitNum;

    // Build query WITHOUT LIMIT/OFFSET as parameters
    let query = `
      SELECT 
        o.*, 
        p.name as product_name, 
        p.image_url as product_image,
        p.price as unit_price,
        u.name as seller_name,
        u.location as seller_location,
        e.status as escrow_status,
        e.amount as escrow_amount
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.seller_id = u.id
      LEFT JOIN escrow e ON o.id = e.order_id AND e.buyer_id = o.buyer_id
      WHERE o.buyer_id = ?
    `;

    const params = [buyer_id];

    if (status && status !== 'all') {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC';
    query += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    console.log('📋 Query for getBuyerOrders:', query);
    console.log('📋 Query params:', params);

    const [orders] = await db.execute(query, params);

    // Format the response
    const formattedOrders = orders.map(order => {
      const total = parseFloat(order.total) || 0;
      const escrowAmount = parseFloat(order.escrow_amount) || total;
      
      return {
        id: order.id,
        product: {
          id: order.product_id,
          name: order.product_name,
          image: order.product_image,
          price: parseFloat(order.unit_price)
        },
        seller: {
          id: order.seller_id,
          name: order.seller_name,
          location: order.seller_location
        },
        quantity: order.quantity,
        total: total,
        status: order.status,
        order_date: order.created_at,
        shipping_address: order.shipping_address,
        delivery_status: order.delivery_status,
        delivery_company_id: order.delivery_company_id,
        delivery_fee: order.delivery_fee,
        type: order.type,
        payment_status: order.payment_status,
        escrow: {
          status: order.escrow_status,
          amount: escrowAmount
        }
      };
    });

    res.json({
      success: true,
      orders: formattedOrders,
      count: formattedOrders.length,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: formattedOrders.length
      }
    });
  } catch (error) {
    console.error('Error fetching buyer orders:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const query = `
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [status, order_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order_id, status }
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status',
      error: error.message
    });
  }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { order_id } = req.params;

    const query = `
      SELECT 
        o.*, 
        p.name as product_name, 
        p.description as product_description,
        p.image_url as product_image,
        p.price as unit_price,
        seller.name as seller_name,
        seller.location as seller_location,
        buyer.name as buyer_name,
        buyer.email as buyer_email,
        buyer.phone as buyer_phone,
        buyer.location as buyer_location
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users seller ON o.seller_id = seller.id
      LEFT JOIN users buyer ON o.buyer_id = buyer.id
      WHERE o.id = ?
    `;

    const [orders] = await db.execute(query, [order_id]);

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const order = orders[0];
    
    // Format the order
    const formattedOrder = {
      id: order.id,
      product: {
        id: order.product_id,
        name: order.product_name,
        description: order.product_description,
        image: order.product_image,
        price: parseFloat(order.unit_price)
      },
      seller: {
        id: order.seller_id,
        name: order.seller_name,
        location: order.seller_location
      },
      buyer: {
        id: order.buyer_id,
        name: order.buyer_name,
        email: order.buyer_email,
        phone: order.buyer_phone,
        location: order.buyer_location
      },
      quantity: order.quantity,
      total: parseFloat(order.total_price || order.total),
      status: order.status,
      order_date: order.order_date || order.created_at,
      shipping_address: order.shipping_address,
      payment_method: order.payment_method,
      notes: order.notes,
      type: order.type
    };

    res.json({
      success: true,
      order: formattedOrder
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
};


// Get orders for current logged-in buyer (uses session)
// Get orders for current logged-in buyer (uses session)
exports.getCurrentBuyerOrders = async (req, res) => {
  try {
    console.log('🔍 getCurrentBuyerOrders - Starting');
    
    // Use req.user.userId from auth middleware
    const buyerId = req.user?.userId;
    
    if (!buyerId) {
      console.log('❌ No userId in req.user');
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    console.log('✅ Using buyerId:', buyerId);

    const { status, page = 1, limit = 20 } = req.query;
    
    // Convert to numbers
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offsetNum = (pageNum - 1) * limitNum;

    // Build the query WITHOUT LIMIT/OFFSET as parameters
    let query = `
      SELECT 
        o.*, 
        p.name as product_name, 
        p.image_url as product_image,
        p.price as unit_price,
        u.name as seller_name,
        u.location as seller_location,
        e.status as escrow_status,
        e.amount as escrow_amount
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.seller_id = u.id
      LEFT JOIN escrow e ON o.id = e.order_id AND e.buyer_id = o.buyer_id
      WHERE o.buyer_id = ?
    `;

    const params = [buyerId];

    if (status && status !== 'all') {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC';
    
    // Add LIMIT and OFFSET directly (not as parameters)
    query += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    console.log('📋 Final query:', query);
    console.log('📋 Query params:', params);

    const [orders] = await db.execute(query, params);

    console.log('📊 Found orders:', orders.length);

    // Simple response format
    const formattedOrders = orders.map(order => {
      const total = parseFloat(order.total) || 0;
      const unitPrice = parseFloat(order.unit_price) || 0;
      const escrowAmount = parseFloat(order.escrow_amount) || total;
      
      // Determine if order can be completed
      // Order can be completed if status is 'completed' and escrow is still 'pending'
      const canComplete = order.status === 'completed' && 
                         order.escrow_status === 'pending';
      
      // Determine if dispute can be submitted
      const canDispute = ['pending', 'paid', 'shipped', 'completed'].includes(order.status) && 
                        order.escrow_status !== 'released' && 
                        order.escrow_status !== 'refunded';
      
      return {
        id: order.id,
        product: {
          id: order.product_id,
          name: order.product_name || 'Product',
          image: order.product_image,
          price: unitPrice
        },
        seller: {
          id: order.seller_id,
          name: order.seller_name || 'Seller',
          location: order.seller_location || 'Location'
        },
        quantity: order.quantity || 1,
        total: total,
        status: order.status || 'pending',
        order_date: order.created_at ? new Date(order.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        shipping_address: order.shipping_address || 'Not specified',
        type: order.type || 'product',
        payment_status: order.payment_status || 'pending',
        payment_method: order.payment_method || null,
        notes: order.notes || null,
        
        // Escrow information
        escrow: {
          status: order.escrow_status || null,
          amount: escrowAmount
        },
        
        // Action flags
        canComplete: canComplete,
        canDispute: canDispute,
        
        // Default delivery info
        hasDelivery: false,
        delivery: null
      };
    });

    res.json({
      success: true,
      orders: formattedOrders,
      count: formattedOrders.length,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: formattedOrders.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching buyer orders:', error);
    console.error('❌ Error details:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
      sqlError: error.sqlMessage
    });
  }
};