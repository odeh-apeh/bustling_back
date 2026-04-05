const db = require("../config/db");

// ✅ Dashboard Stats
// backend/routes/admin.js
// ✅ Dashboard Stats - FIXED VERSION
exports.getDashboardStats = async (req, res) => {
  try {
    console.log("📊 Dashboard endpoint called");
    
    // Execute queries one by one to debug which one fails
    let usersCount = 0, productsCount = 0, ordersCount = 0, servicesCount = 0;
    let totalRevenue = 0, pendingEscrows = 0, pendingDeposits = 0;
    let pendingWithdrawals = 0, pendingDisputes = 0;
    let recentTransactions = [];

    try {
      // 1. Users count
      const [usersResult] = await db.execute("SELECT COUNT(*) as count FROM users");
      usersCount = usersResult[0]?.count || 0;
      console.log("Users count:", usersCount);
    } catch (err) {
      console.error("Users query error:", err.message)
    }

    try {
      // 2. Products count
      const [productsResult] = await db.execute("SELECT COUNT(*) as count FROM products WHERE type='product'");
      productsCount = productsResult[0]?.count || 0;
      console.log("Products count:", productsCount);
    } catch (err) {
      console.error("Products query error:", err.message);
    }

    try {
      // 3. Orders count
      const [ordersResult] = await db.execute("SELECT COUNT(*) as count FROM orders");
      ordersCount = ordersResult[0]?.count || 0;
      console.log("Orders count:", ordersCount);
    } catch (err) {
      console.error("Orders query error:", err.message);
    }

    try {
      // 4. Services count
      const [servicesResult] = await db.execute("SELECT COUNT(*) as count FROM products WHERE type='service'");
      servicesCount = servicesResult[0]?.count || 0;
      console.log("Services count:", servicesCount);
    } catch (err) {
      console.error("Services query error:", err.message);
    }

    try {
      // 5. Total revenue
      const [revenueResult] = await db.execute("SELECT SUM(amount) as total FROM escrow WHERE status='released'");
      totalRevenue = revenueResult[0]?.total || 0;
      console.log("Total revenue:", totalRevenue);
    } catch (err) {
      console.error("Revenue query error:", err.message);
    }

    try {
      // 6. Pending escrows
      const [escrowsResult] = await db.execute("SELECT COUNT(*) as count FROM escrow WHERE status='pending'");
      pendingEscrows = escrowsResult[0]?.count || 0;
      console.log("Pending escrows:", pendingEscrows);
    } catch (err) {
      console.error("Escrows query error:", err.message);
    }

    try {
      // 7. Pending deposits
      const [depositsResult] = await db.execute("SELECT COUNT(*) as count FROM deposits WHERE status='pending'");
      pendingDeposits = depositsResult[0]?.count || 0;
      console.log("Pending deposits:", pendingDeposits);
    } catch (err) {
      console.error("Deposits query error:", err.message);
    }

    try {
      // 8. Pending withdrawals
      const [withdrawalsResult] = await db.execute("SELECT COUNT(*) as count FROM withdrawals WHERE status='pending'");
      pendingWithdrawals = withdrawalsResult[0]?.count || 0;
      console.log("Pending withdrawals:", pendingWithdrawals);
    } catch (err) {
      console.error("Withdrawals query error:", err.message);
      // If withdrawals table doesn't exist, return 0
    }

    try {
      // 9. Pending disputes
      const [disputesResult] = await db.execute("SELECT COUNT(*) as count FROM orders WHERE dispute_status = 'open'");
      pendingDisputes = disputesResult[0]?.count || 0;
      console.log("Pending disputes:", pendingDisputes);
    } catch (err) {
      console.error("Disputes query error:", err.message);
      // If dispute_status column doesn't exist, return 0
    }

    try {
      // 10. Recent transactions
      const [transactionsResult] = await db.execute(`
        SELECT t.*, u.name as user_name 
        FROM transactions t 
        JOIN users u ON t.user_id = u.id 
        ORDER BY t.created_at DESC 
        LIMIT 10
      `);
      recentTransactions = transactionsResult || [];
      console.log("Recent transactions count:", recentTransactions.length);
    } catch (err) {
      console.error("Transactions query error:", err.message);
      recentTransactions = [];
    }

    // Debug: Check database structure
    try {
      const [tables] = await db.execute("SHOW TABLES");
      console.log("Available tables:", tables.map(t => Object.values(t)[0]));
    } catch (err) {
      console.error("Table check error:", err.message);
    }

    res.json({
      success: true,
      stats: {
        totalUsers: usersCount,
        totalProducts: productsCount,
        totalOrders: ordersCount,
        totalServices: servicesCount,
        totalRevenue: totalRevenue,
        pendingEscrows: pendingEscrows,
        pendingDeposits: pendingDeposits,
        pendingWithdrawals: pendingWithdrawals,
        pendingDisputes: pendingDisputes
      },
      recentTransactions: recentTransactions,
      debug: {
        timestamp: new Date().toISOString(),
        queriesExecuted: true
      }
    });

  } catch (err) {
    console.error("Dashboard stats error:", err);
    console.error("Full error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message,
      sql: err.sql
    });
  }
};

// ✅ User Management
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    // Build WHERE clause if search exists
    let whereClause = '';
    let params = [];
    
    if (search.trim()) {
      whereClause = ' WHERE phone LIKE ? OR name LIKE ? OR email LIKE ?';
      const searchTerm = `%${search.trim()}%`;
      params = [searchTerm, searchTerm, searchTerm];
    }

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM users${whereClause}`;
    const [[{ total }]] = await db.execute(countSql, params);

    // Get users - include is_blocked field
    const usersSql = `
      SELECT u.*, 
             w.balance as wallet_balance,
             (SELECT COUNT(*) FROM products WHERE seller_id = u.id) as products_count,
             (SELECT COUNT(*) FROM orders WHERE buyer_id = u.id) as orders_count
      FROM users u
      LEFT JOIN wallet w ON u.id = w.user_id
      ${whereClause}
      ORDER BY u.id DESC 
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    const [users] = params.length > 0 
      ? await db.execute(usersSql, params)
      : await db.execute(usersSql);

    console.log('Raw user data from DB (first user):', users[0] ? {
      id: users[0].id,
      name: users[0].name,
      is_blocked: users[0].is_blocked,
      type: users[0].type
    } : 'No users found');

    // Format response - include is_blocked
    const formattedUsers = users.map(user => {
      // Check if is_blocked exists and convert to boolean
      const isBlocked = user.is_blocked !== undefined 
        ? Boolean(user.is_blocked) 
        : (user.type === 'blocked'); // Fallback to type field
      
      return {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        type: user.type,
        location: user.location,
        wallet_balance: user.wallet_balance || 0,
        products_count: user.products_count || 0,
        orders_count: user.orders_count || 0,
        created_at: user.created_at || new Date().toISOString(),
        status: isBlocked ? 'blocked' : 'active',
        is_blocked: isBlocked
      };
    });

    res.json({
      users: formattedUsers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('Error in getAllUsers:', err);
    res.status(500).json({ 
      message: 'Server error', 
      error: err.message 
    });
  }
};

// Also update the updateUser function to match your schema
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_blocked, reason } = req.body;

    console.log('UPDATE USER REQUEST:', {
      userId,
      is_blocked,
      reason,
      body: req.body
    });

    if (is_blocked === undefined) {
      return res.status(400).json({ message: "is_blocked parameter required" });
    }

    // Convert to boolean/1/0 for database
    const blockedValue = Boolean(is_blocked);
    const blockedInt = blockedValue ? 1 : 0;

    console.log('Updating user', userId, 'is_blocked to:', blockedValue, '(DB value:', blockedInt, ')');

    // Update the user
    const [result] = await db.execute(
      "UPDATE users SET is_blocked = ?, updated_at = NOW() WHERE id = ?",
      [blockedInt, userId]
    );

    console.log('Update result:', {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows
    });

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify the update worked
    const [[updatedUser]] = await db.execute(
      "SELECT id, name, is_blocked FROM users WHERE id = ?",
      [userId]
    );

    console.log('Verified update - user now has is_blocked:', updatedUser.is_blocked);

    res.json({ 
      success: true,
      message: `User ${blockedValue ? 'blocked' : 'unblocked'} successfully`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        is_blocked: Boolean(updatedUser.is_blocked)
      }
    });
  } catch (err) {
    console.error("Update user error details:", {
      message: err.message,
      code: err.code,
      sql: err.sql,
      stack: err.stack
    });
    
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message
    });
  }
};

// ✅ Product/Service Management - Get all products (both physical and services)
exports.getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", type = '', status = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    const queryParams = [];

    if (search) {
      whereConditions.push("(p.title LIKE ? OR p.description LIKE ?)");
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (type) {
      whereConditions.push("p.type = ?");
      queryParams.push(type);
    }

    if (status) {
      whereConditions.push("p.status = ?");
      queryParams.push(status);
    }

    // Build WHERE clause
    let whereClause = "";
    if (whereConditions.length > 0) {
      whereClause = "WHERE " + whereConditions.join(" AND ");
    }

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM products p ${whereClause}`;
    const [[{ total }]] = await db.execute(countQuery, queryParams);

    // Main query with string concatenation for limit/offset
    const query = `
      SELECT p.*, 
             u.name as seller_name, 
             u.phone as seller_phone,
             u.email as seller_email,
             c.name as category_name
      FROM products p
      JOIN users u ON p.seller_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;
    
    console.log("Query:", query);
    console.log("Params:", queryParams);
    
    const [products] = await db.execute(query, queryParams);

    res.json({
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("Error in getAllProducts:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Delete Product/Service
exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { deleteType = 'soft' } = req.body; // 'soft' or 'hard'

    // Check if product exists
    const [productRows] = await db.execute(
      "SELECT * FROM products WHERE id = ?",
      [productId]
    );

    if (productRows.length === 0) {
      return res.status(404).json({ message: "Product/Service not found" });
    }

    const product = productRows[0];
    const productType = product.type === 'service' ? 'Service' : 'Product';

    if (deleteType === 'soft') {
      // Soft delete - mark as deleted
      await db.execute(
        "UPDATE products SET status = 'deleted', deleted_at = NOW() WHERE id = ?",
        [productId]
      );
      res.json({ 
        message: `${productType} soft deleted successfully`,
        note: `${productType} marked as deleted but data preserved`
      });
    } else if (deleteType === 'hard') {
      // Hard delete - permanently remove
      // Check if product has active orders or escrow
      const [activeOrders] = await db.execute(
        "SELECT COUNT(*) as count FROM orders WHERE product_id = ? AND status NOT IN ('completed', 'cancelled')",
        [productId]
      );

      const [activeEscrow] = await db.execute(
        "SELECT COUNT(*) as count FROM escrow e JOIN orders o ON e.order_id = o.id WHERE o.product_id = ? AND e.status = 'pending'",
        [productId]
      );

      if (activeOrders[0].count > 0 || activeEscrow[0].count > 0) {
        return res.status(400).json({ 
          message: `Cannot delete ${productType.toLowerCase()} with active orders or pending escrow`
        });
      }

      await db.execute("DELETE FROM products WHERE id = ?", [productId]);
      res.json({ 
        message: `${productType} permanently deleted successfully`,
        warning: "This action cannot be undone"
      });
    } else {
      return res.status(400).json({ message: "Invalid delete type. Use 'soft' or 'hard'" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Order Management
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', dispute_status = '' } = req.query;
    const offset = (page - 1) * limit;
    const pageLimit = parseInt(limit);
    const pageOffset = parseInt(offset);

    let whereClause = " WHERE 1=1";
    const params = [];

    if (status) {
      whereClause += " AND o.status = ?";
      params.push(status);
    }

    if (dispute_status) {
      whereClause += " AND o.payment_status = ?";
      params.push(dispute_status);
    }

    // DEBUG: Log what's being sent
    console.log("Params for main query:", [...params, pageLimit, pageOffset]);
    
    // Use a different approach - build the query dynamically
    const query = `
      SELECT o.*,
             b.name as buyer_name,
             b.phone as buyer_phone,
             s.name as seller_name,
             s.phone as seller_phone,
             p.name as product_title,
             p.type as product_type,
             p.price as product_price,
             p.location as product_location
      FROM orders o
      JOIN users b ON o.buyer_id = b.id
      JOIN users s ON o.seller_id = s.id
      JOIN products p ON o.product_id = p.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ${pageLimit} OFFSET ${pageOffset}
    `;
    
    const [orders] = await db.execute(query, params);

    // For count query
    const countQuery = `SELECT COUNT(*) as total FROM orders o ${whereClause}`;
    const [[{ total }]] = await db.execute(countQuery, params);

    res.json({
      orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: pageLimit,
        pages: Math.ceil(total / pageLimit)
      }
    });
  } catch (err) {
    console.error("Error in getAllOrders:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const adminEmail = req.adminEmail || 'System Admin';

    // Validate status - match your enum
    const validStatuses = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    await db.execute(
      "UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?",
      [status, orderId]
    );

    // Log the status change
    await db.execute(
      "INSERT INTO order_logs (order_id, action, details, admin_info) VALUES (?, ?, ?, ?)",
      [orderId, 'status_update', `Status changed to ${status}`, adminEmail]
    );

    res.json({ message: 'Order status updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get All Disputes with proper data
exports.getAllDisputes = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = '', 
      dispute_type = '',
      search = '' 
    } = req.query;
    
    const offset = (page - 1) * limit;
    const pageLimit = parseInt(limit);
    const pageOffset = parseInt(offset);

    let whereConditions = ["1=1"];
    const queryParams = [];

    if (status) {
      whereConditions.push("d.status = ?");
      queryParams.push(status);
    }

    if (dispute_type) {
      whereConditions.push("d.dispute_type = ?");
      queryParams.push(dispute_type);
    }

    if (search) {
      whereConditions.push("(o.id LIKE ? OR r.name LIKE ? OR du.name LIKE ? OR p.name LIKE ?)");
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

    // Get disputes with all related data
    const disputesQuery = `
      SELECT 
        d.*,
        o.id as order_id,
        o.total as order_amount,
        o.status as order_status,
        o.payment_status,
        o.created_at as order_date,
        
        r.id as raised_by_id,
        r.name as raised_by_name,
        r.phone as raised_by_phone,
        r.email as raised_by_email,
        
        du.id as disputed_user_id,
        du.name as disputed_user_name,
        du.phone as disputed_user_phone,
        du.email as disputed_user_email,
        
        p.id as product_id,
        p.name as product_name,
        p.type as product_type,
        p.price as product_price,
        
        e.amount as escrow_amount,
        e.status as escrow_status,
        e.created_at as escrow_created,
        
        admin.name as resolved_by_name
        
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      JOIN users r ON d.raised_by_id = r.id
      JOIN users du ON d.disputed_user_id = du.id
      JOIN products p ON o.product_id = p.id
      JOIN escrow e ON d.escrow_id = e.id
      LEFT JOIN users admin ON d.resolved_by = admin.id
      ${whereClause}
      ORDER BY 
        CASE d.status 
          WHEN 'pending' THEN 1
          WHEN 'under_review' THEN 2
          WHEN 'resolved' THEN 3
          WHEN 'cancelled' THEN 4
        END,
        d.created_at DESC
      LIMIT ${pageLimit} OFFSET ${pageOffset}
    `;

    const [disputes] = await db.execute(disputesQuery, queryParams);

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      JOIN users r ON d.raised_by_id = r.id
      JOIN users du ON d.disputed_user_id = du.id
      ${whereClause}
    `;

    const [[{ total }]] = await db.execute(countQuery, queryParams);

    // Format disputes for frontend
    const formattedDisputes = disputes.map(dispute => ({
      id: dispute.id,
      order_id: dispute.order_id,
      escrow_id: dispute.escrow_id,
      title: dispute.title,
      description: dispute.description,
      dispute_type: dispute.dispute_type,
      status: dispute.status,
      raised_by: {
        id: dispute.raised_by_id,
        name: dispute.raised_by_name,
        phone: dispute.raised_by_phone,
        email: dispute.raised_by_email,
        role: dispute.raised_by_role
      },
      disputed_user: {
        id: dispute.disputed_user_id,
        name: dispute.disputed_user_name,
        phone: dispute.disputed_user_phone,
        email: dispute.disputed_user_email
      },
      product: {
        id: dispute.product_id,
        name: dispute.product_name,
        type: dispute.product_type,
        price: dispute.product_price
      },
      order: {
        id: dispute.order_id,
        amount: dispute.order_amount,
        status: dispute.order_status,
        payment_status: dispute.payment_status,
        date: dispute.order_date
      },
      escrow: {
        amount: dispute.escrow_amount,
        status: dispute.escrow_status,
        created: dispute.escrow_created
      },
      evidence: dispute.evidence_urls ? JSON.parse(dispute.evidence_urls) : [],
      resolution: dispute.resolution,
      admin_notes: dispute.admin_notes,
      resolved_by: dispute.resolved_by_name,
      created_at: dispute.created_at,
      updated_at: dispute.updated_at,
      resolved_at: dispute.resolved_at
    }));

    // Get stats for dashboard
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) as under_review,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM disputes
    `;

    const [[stats]] = await db.execute(statsQuery);

    res.json({
      disputes: formattedDisputes,
      stats,
      pagination: {
        total,
        page: parseInt(page),
        limit: pageLimit,
        pages: Math.ceil(total / pageLimit)
      }
    });

  } catch (err) {
    console.error("Error in getAllDisputes:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Get Single Dispute with Messages
exports.getDisputeById = async (req, res) => {
  try {
    const { disputeId } = req.params;

    // Get dispute details
    const disputeQuery = `
      SELECT 
        d.*,
        o.id as order_id,
        o.total as order_amount,
        o.status as order_status,
        o.payment_status,
        o.shipping_address,
        o.delivery_status,
        o.delivery_company_id,
        
        r.id as raised_by_id,
        r.name as raised_by_name,
        r.phone as raised_by_phone,
        r.email as raised_by_email,
        
        du.id as disputed_user_id,
        du.name as disputed_user_name,
        du.phone as disputed_user_phone,
        du.email as disputed_user_email,
        
        p.id as product_id,
        p.name as product_name,
        p.type as product_type,
        p.price as product_price,
        p.description as product_description,
        p.image_url as product_image,
        
        e.amount as escrow_amount,
        e.status as escrow_status,
        e.created_at as escrow_created,
        
        admin.name as resolved_by_name,
        
        dc.name as delivery_company_name,
        dc.phone as delivery_company_phone
        
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      JOIN users r ON d.raised_by_id = r.id
      JOIN users du ON d.disputed_user_id = du.id
      JOIN products p ON o.product_id = p.id
      JOIN escrow e ON d.escrow_id = e.id
      LEFT JOIN users admin ON d.resolved_by = admin.id
      LEFT JOIN users dc ON o.delivery_company_id = dc.id
      WHERE d.id = ?
    `;

    const [[dispute]] = await db.execute(disputeQuery, [disputeId]);

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    // Get dispute messages/comments
    const [messages] = await db.execute(`
      SELECT dm.*, u.name as user_name, u.role as user_role
      FROM dispute_messages dm
      JOIN users u ON dm.user_id = u.id
      WHERE dm.dispute_id = ?
      ORDER BY dm.created_at ASC
    `, [disputeId]);

    // Format response
    const formattedDispute = {
      id: dispute.id,
      order_id: dispute.order_id,
      escrow_id: dispute.escrow_id,
      title: dispute.title,
      description: dispute.description,
      dispute_type: dispute.dispute_type,
      status: dispute.status,
      raised_by: {
        id: dispute.raised_by_id,
        name: dispute.raised_by_name,
        phone: dispute.raised_by_phone,
        email: dispute.raised_by_email,
        role: dispute.raised_by_role
      },
      disputed_user: {
        id: dispute.disputed_user_id,
        name: dispute.disputed_user_name,
        phone: dispute.disputed_user_phone,
        email: dispute.disputed_user_email
      },
      product: {
        id: dispute.product_id,
        name: dispute.product_name,
        type: dispute.product_type,
        price: dispute.product_price,
        description: dispute.product_description,
        image: dispute.product_image
      },
      order: {
        id: dispute.order_id,
        amount: dispute.order_amount,
        status: dispute.order_status,
        payment_status: dispute.payment_status,
        shipping_address: dispute.shipping_address,
        delivery_status: dispute.delivery_status,
        delivery_company: dispute.delivery_company_id ? {
          id: dispute.delivery_company_id,
          name: dispute.delivery_company_name,
          phone: dispute.delivery_company_phone
        } : null
      },
      escrow: {
        amount: dispute.escrow_amount,
        status: dispute.escrow_status,
        created: dispute.escrow_created
      },
      evidence: dispute.evidence_urls ? JSON.parse(dispute.evidence_urls) : [],
      resolution: dispute.resolution,
      admin_notes: dispute.admin_notes,
      resolved_by: dispute.resolved_by_name,
      messages: messages,
      created_at: dispute.created_at,
      updated_at: dispute.updated_at,
      resolved_at: dispute.resolved_at
    };

    res.json({ dispute: formattedDispute });

  } catch (err) {
    console.error("Error in getDisputeById:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Add Message to Dispute
exports.addDisputeMessage = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { message, is_internal } = req.body;
    const userId = req.session.userId;

    if (!message?.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    await db.execute(
      `INSERT INTO dispute_messages (dispute_id, user_id, message, is_internal, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [disputeId, userId, message.trim(), is_internal || false]
    );

    res.json({ message: "Message added successfully" });

  } catch (err) {
    console.error("Error in addDisputeMessage:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Update Dispute Status
exports.updateDisputeStatus = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { status, admin_notes } = req.body;
    const userId = req.session.userId;

    const validStatuses = ['pending', 'under_review', 'resolved', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    await db.execute(
      `UPDATE disputes 
       SET status = ?, 
           admin_notes = CONCAT(IFNULL(admin_notes, ''), '\n', ?),
           updated_at = NOW()
       WHERE id = ?`,
      [status, `[${new Date().toISOString()}] Status changed to ${status}: ${admin_notes || 'No notes'}`, disputeId]
    );

    res.json({ message: "Dispute status updated successfully" });

  } catch (err) {
    console.error("Error in updateDisputeStatus:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Resolve Dispute with Escrow Action
exports.resolveDispute = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { disputeId } = req.params;
    const { resolution, admin_notes, refund_amount } = req.body;
    const userId = req.session.userId;

    const validResolutions = ['release_to_seller', 'refund_to_buyer', 'partial_refund', 'split_payment', 'case_dismissed'];
    if (!validResolutions.includes(resolution)) {
      await connection.rollback();
      return res.status(400).json({ message: "Invalid resolution" });
    }

    await connection.beginTransaction();

    // Get dispute details with escrow info
    const [[dispute]] = await connection.execute(`
      SELECT d.*, e.amount as escrow_amount, e.buyer_id, e.seller_id, e.order_id
      FROM disputes d
      JOIN escrow e ON d.escrow_id = e.id
      WHERE d.id = ? AND d.status != 'resolved'
    `, [disputeId]);

    if (!dispute) {
      await connection.rollback();
      return res.status(404).json({ message: "Dispute not found or already resolved" });
    }

    // Handle different resolutions
    if (resolution === 'release_to_seller') {
      // Release full amount to seller
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [dispute.escrow_amount, dispute.seller_id]
      );
      await connection.execute(
        "UPDATE escrow SET status = 'released', released_at = NOW() WHERE id = ?",
        [dispute.escrow_id]
      );

    } else if (resolution === 'refund_to_buyer') {
      // Refund full amount to buyer
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [dispute.escrow_amount, dispute.buyer_id]
      );
      await connection.execute(
        "UPDATE escrow SET status = 'refunded', released_at = NOW() WHERE id = ?",
        [dispute.escrow_id]
      );

    } else if (resolution === 'partial_refund') {
      const refundAmt = refund_amount || Math.floor(dispute.escrow_amount * 0.5);
      const sellerAmt = dispute.escrow_amount - refundAmt;
      
      // Refund partial to buyer
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [refundAmt, dispute.buyer_id]
      );
      
      // Release rest to seller
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [sellerAmt, dispute.seller_id]
      );
      
      await connection.execute(
        "UPDATE escrow SET status = 'partially_released', released_at = NOW() WHERE id = ?",
        [dispute.escrow_id]
      );

    } else if (resolution === 'split_payment') {
      // 50/50 split
      const halfAmount = dispute.escrow_amount / 2;
      
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [halfAmount, dispute.buyer_id]
      );
      
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [halfAmount, dispute.seller_id]
      );
      
      await connection.execute(
        "UPDATE escrow SET status = 'split_released', released_at = NOW() WHERE id = ?",
        [dispute.escrow_id]
      );
    }
    // case_dismissed - no money movement, just close dispute

    // Update dispute record
    await connection.execute(
      `UPDATE disputes 
       SET status = 'resolved',
           resolution = ?,
           resolved_by = ?,
           resolved_at = NOW(),
           admin_notes = CONCAT(IFNULL(admin_notes, ''), '\n', ?),
           updated_at = NOW()
       WHERE id = ?`,
      [
        resolution,
        userId,
        `[${new Date().toISOString()}] Dispute resolved: ${resolution}. ${admin_notes || 'No additional notes'}`,
        disputeId
      ]
    );

    // Update order dispute status
    await connection.execute(
      "UPDATE orders SET dispute_status = 'closed', updated_at = NOW() WHERE id = ?",
      [dispute.order_id]
    );

    await connection.commit();
    res.json({ message: "Dispute resolved successfully", resolution });

  } catch (err) {
    await connection.rollback();
    console.error("Error in resolveDispute:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    connection.release();
  }
};

// ✅ Wallet & Transaction Monitoring
exports.getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = '', user_id = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "";
    const params = [];

    if (type) {
      whereClause += whereClause ? " AND" : " WHERE";
      whereClause += " t.type = ?";
      params.push(type);
    }

    if (user_id) {
      whereClause += whereClause ? " AND" : " WHERE";
      whereClause += " t.user_id = ?";
      params.push(user_id);
    }

    const [transactions] = await db.execute(`
      SELECT t.*, 
             u.name as user_name,
             u.phone as user_phone,
             w.balance as current_balance
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN wallets w ON t.user_id = w.user_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) as total FROM transactions ${whereClause}`,
      params
    );

    res.json({
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Escrow Management
exports.getAllEscrows = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = '', 
      type = '',
      search = '',
      date_range = 'all'
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offsetNum = (pageNum - 1) * limitNum;

    // Build where conditions
    let whereConditions = ["1=1"];
    let queryParams = [];

    if (status && status !== 'all') {
      whereConditions.push("e.status = ?");
      queryParams.push(status);
    }

    if (search) {
      whereConditions.push("(e.id LIKE ? OR b.name LIKE ? OR s.name LIKE ? OR p.name LIKE ?)");
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Date range filtering
    if (date_range !== 'all') {
      let dateCondition = "";
      if (date_range === 'today') {
        dateCondition = "DATE(e.created_at) = CURDATE()";
      } else if (date_range === 'week') {
        dateCondition = "e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
      } else if (date_range === 'month') {
        dateCondition = "e.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
      }
      
      if (dateCondition) {
        whereConditions.push(dateCondition);
      }
    }

    const whereClause = whereConditions.length > 1 ? "WHERE " + whereConditions.join(" AND ") : "";

    // Main escrows query - FIXED: Proper parameter binding
    const escrowsQuery = `
      SELECT 
        e.id,
        e.buyer_id,
        e.seller_id,
        e.transaction_id,
        e.order_id,
        e.delivery_id,
        e.amount,
        e.status,
        e.created_at,
        e.released_at,
        b.name as buyer_name,
        b.phone as buyer_phone,
        s.name as seller_name,
        s.phone as seller_phone,
        p.name as product_name,
        o.status as order_status,
        o.payment_status,
        dc.company_name as delivery_company,
        o.delivery_status
      FROM escrow e
      LEFT JOIN users b ON e.buyer_id = b.id
      LEFT JOIN users s ON e.seller_id = s.id
      LEFT JOIN orders o ON e.order_id = o.id
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN delivery_companies dc ON e.delivery_id = dc.id
      ${whereClause}
      ORDER BY 
        CASE e.status 
          WHEN 'pending' THEN 1
          WHEN 'disputed' THEN 2
          WHEN 'released' THEN 3
          WHEN 'refunded' THEN 4
        END,
        e.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    // Add LIMIT and OFFSET to parameters
    const escrowsParams = [...queryParams, limitNum, offsetNum];
    
    console.log("Escrows Query:", escrowsQuery);
    console.log("Escrows Params:", escrowsParams);
    
    const [escrows] = await db.execute(escrowsQuery, escrowsParams);

    // Stats query - separate from main query parameters
    let statsConditions = ["1=1"];
    let statsParams = [];

    if (status && status !== 'all') {
      statsConditions.push("status = ?");
      statsParams.push(status);
    }

    if (search) {
      statsConditions.push("id LIKE ?");
      const searchTerm = `%${search}%`;
      statsParams.push(searchTerm);
    }

    if (date_range !== 'all') {
      let dateCondition = "";
      if (date_range === 'today') {
        dateCondition = "DATE(created_at) = CURDATE()";
      } else if (date_range === 'week') {
        dateCondition = "created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
      } else if (date_range === 'month') {
        dateCondition = "created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
      }
      
      if (dateCondition) {
        statsConditions.push(dateCondition);
      }
    }

    const statsWhereClause = statsConditions.length > 1 ? "WHERE " + statsConditions.join(" AND ") : "";

    // Stats query
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'released' THEN 1 ELSE 0 END) as released,
        SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) as disputed,
        SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refunded,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount
      FROM escrow
      ${statsWhereClause}
    `;
    
    console.log("Stats Query:", statsQuery);
    console.log("Stats Params:", statsParams);
    
    const [statsRows] = await db.execute(statsQuery, statsParams);
    const stats = statsRows[0] || {};

    // Format the response - ensure all fields are properly converted
    const formattedEscrows = escrows.map(escrow => ({
      id: escrow.id ? escrow.id.toString() : '', // Convert to string
      buyer_id: escrow.buyer_id,
      seller_id: escrow.seller_id,
      transaction_id: escrow.transaction_id,
      order_id: escrow.order_id,
      delivery_id: escrow.delivery_id,
      amount: parseFloat(escrow.amount) || 0,
      status: escrow.status || 'pending',
      created_at: escrow.created_at,
      released_at: escrow.released_at,
      buyer_name: escrow.buyer_name || 'Unknown Buyer',
      buyer_phone: escrow.buyer_phone || '',
      seller_name: escrow.seller_name || 'Unknown Seller',
      seller_phone: escrow.seller_phone || '',
      product_name: escrow.product_name || 'Unknown Product',
      order_status: escrow.order_status || '',
      payment_status: escrow.payment_status || '',
      delivery_company: escrow.delivery_company || '',
      delivery_status: escrow.delivery_status || ''
    }));

    res.json({
      success: true,
      escrows: formattedEscrows,
      stats: {
        total: parseInt(stats.total) || 0,
        pending: parseInt(stats.pending) || 0,
        released: parseInt(stats.released) || 0,
        disputed: parseInt(stats.disputed) || 0,
        refunded: parseInt(stats.refunded) || 0,
        total_amount: parseFloat(stats.total_amount) || 0,
        pending_amount: parseFloat(stats.pending_amount) || 0
      },
      pagination: {
        total: parseInt(stats.total) || 0,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil((parseInt(stats.total) || 0) / limitNum)
      }
    });

  } catch (err) {
    console.error("Error in getAllEscrows:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message,
      sql: err.sql
    });
  }
};

// ✅ Your existing release/refund escrow functions (keep them as they are)
exports.releaseEscrow = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { escrowId } = req.body;

    await connection.beginTransaction();

    // Find escrow
    const [rows] = await connection.execute("SELECT * FROM escrow WHERE id=?", [escrowId]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Escrow not found" });
    }

    const escrow = rows[0];
    if (escrow.status !== "pending") {
      await connection.rollback();
      return res.status(400).json({ message: "Escrow already resolved" });
    }

    // Credit seller - FIXED: Use "wallet" not "wallets"
    await connection.execute(
      "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
      [escrow.amount, escrow.seller_id]
    );

    // Update escrow
    await connection.execute(
      "UPDATE escrow SET status='released', released_at=NOW() WHERE id=?",
      [escrowId]
    );

    await connection.commit();
    res.json({ message: "Escrow released to seller" });
  } catch (err) {
    await connection.rollback();
    console.error("Release Escrow Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    connection.release();
  }
};

exports.refundEscrow = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { escrowId } = req.body;

    await connection.beginTransaction();

    // Find escrow
    const [rows] = await connection.execute("SELECT * FROM escrow WHERE id=?", [escrowId]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Escrow not found" });
    }

    const escrow = rows[0];
    if (escrow.status !== "pending") {
      await connection.rollback();
      return res.status(400).json({ message: "Escrow already resolved" });
    }

    // Refund buyer - FIXED: Use "wallet" not "wallets"
    await connection.execute(
      "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
      [escrow.amount, escrow.buyer_id]
    );

    // Update escrow
    await connection.execute(
      "UPDATE escrow SET status='refunded', released_at=NOW() WHERE id=?",
      [escrowId]
    );

    await connection.commit();
    res.json({ message: "Escrow refunded to buyer" });
  } catch (err) {
    await connection.rollback();
    console.error("Refund Escrow Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    connection.release();
  }
};

exports.getEscrowById = async (req, res) => {
  try {
    const { escrowId } = req.params;

    const escrowQuery = `
      SELECT 
        e.*,
        b.name as buyer_name,
        b.phone as buyer_phone,
        b.email as buyer_email,
        s.name as seller_name,
        s.phone as seller_phone,
        s.email as seller_email,
        p.name as product_name,
        p.price as product_price,
        o.status as order_status,
        o.payment_status,
        o.shipping_address,
        o.delivery_status,
        dc.company_name as delivery_company,
        dc.phone_number as delivery_phone,
        t.type as transaction_type,
        t.status as transaction_status
        
      FROM escrow e
      LEFT JOIN users b ON e.buyer_id = b.id
      LEFT JOIN users s ON e.seller_id = s.id
      LEFT JOIN orders o ON e.order_id = o.id
      LEFT JOIN products p ON o.product_id = p.id
      LEFT JOIN delivery_companies dc ON e.delivery_id = dc.id
      LEFT JOIN transactions t ON e.transaction_id = t.id
      WHERE e.id = ?
    `;

    const [[escrow]] = await db.execute(escrowQuery, [escrowId]);

    if (!escrow) {
      return res.status(404).json({ message: "Escrow not found" });
    }

    res.json({ escrow });

  } catch (err) {
    console.error("Error in getEscrowById:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update escrow status (you already have resolveDispute, but add this)
exports.updateEscrowStatus = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { escrowId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'released', 'disputed', 'refunded', 'held'];
    if (!validStatuses.includes(status)) {
      await connection.rollback();
      return res.status(400).json({ message: "Invalid status" });
    }

    await connection.beginTransaction();

    // Get current escrow
    const [[escrow]] = await connection.execute(
      "SELECT * FROM escrow WHERE id = ?",
      [escrowId]
    );

    if (!escrow) {
      await connection.rollback();
      return res.status(404).json({ message: "Escrow not found" });
    }

    // Update escrow status
    await connection.execute(
      `UPDATE escrow 
       SET status = ?, 
           updated_at = NOW(),
           ${status === 'released' || status === 'refunded' ? 'released_at = NOW(),' : ''}
           notes = CONCAT(IFNULL(notes, ''), '\n', ?)
       WHERE id = ?`,
      [
        status,
        `[${new Date().toISOString()}] Status changed to ${status}: ${notes || 'No notes'}`,
        escrowId
      ]
    );

    // Update related transaction if needed
    if (status === 'released' || status === 'refunded') {
      await connection.execute(
        "UPDATE transactions SET status = ? WHERE id = ?",
        [status === 'released' ? 'completed' : 'refunded', escrow.transaction_id]
      );
    }

    // Log the status change
    await connection.execute(
      `INSERT INTO escrow_logs (escrow_id, action, details, admin_id, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [escrowId, 'status_update', `Status changed to ${status}: ${notes || 'No notes'}`, req.session.user?.id || 0]
    );

    await connection.commit();
    res.json({ message: "Escrow status updated successfully" });

  } catch (err) {
    await connection.rollback();
    console.error("Error in updateEscrowStatus:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    connection.release();
  }
};


// ✅ Hardcoded Admin Credentials
const ADMIN_CREDENTIALS = {
  phone: "08123456789", 
  password: "admin123"  
};

// ✅ Admin Login - No Database Check
exports.adminLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Phone and password required" });
    }

    // Check against hardcoded credentials
    if (phone !== ADMIN_CREDENTIALS.phone || password !== ADMIN_CREDENTIALS.password) {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }

    // Set session with hardcoded admin user
    req.session.user = {
      id: 999999, // Fixed admin ID
      name: 'System Administrator',
      phone: ADMIN_CREDENTIALS.phone,
      email: 'admin@system.com',
      role: 'admin',
      is_super_admin: true
    };

    res.json({
      message: "Admin login successful",
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin Logout
exports.adminLogout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Logout failed" });
    }
    res.json({ message: "Logged out successfully" });
  });
};

// ✅ Get Admin Profile
exports.getAdminProfile = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  res.json({ user: req.session.user });
};

/* --------------------------------------------------
   ✅  ADMIN: Get All Pending Deposits
-------------------------------------------------- */
/* --------------------------------------------------
   ✅  ADMIN: Get All Pending Deposits - FIXED
-------------------------------------------------- */
/* --------------------------------------------------
   ✅  ADMIN: Get All Pending Deposits - FIXED
-------------------------------------------------- */
exports.getPendingDeposits = async (req, res) => {
  try {
    console.log("🔍 Pending deposits endpoint called");
    
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    console.log("Page:", page, "Limit:", limit, "Offset:", offset);

    console.log("📊 Fetching pending deposits from database...");

    // FIX: Build the SQL query with actual values instead of placeholders
    const sql = `
      SELECT 
        d.id,
        d.user_id,
        d.invoice_number,
        d.amount,
        d.narration,
        d.status,
        d.admin_notes,
        d.approved_by,
        d.approved_at,
        d.created_at,
        d.updated_at,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone
       FROM deposits d
       JOIN users u ON d.user_id = u.id
       WHERE d.status = 'pending'
       ORDER BY d.created_at ASC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;
    
    console.log("SQL Query:", sql);
    
    // Execute without parameters
    const [deposits] = await db.execute(sql);

    console.log(`📊 Found ${deposits.length} pending deposits`);

    // Get total count
    const [totalResult] = await db.execute(
      "SELECT COUNT(*) as total FROM deposits WHERE status = 'pending'"
    );

    const total = totalResult[0]?.total || 0;
    
    // Return simple data
    res.json({
      success: true,
      deposits: deposits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error("Get pending deposits error:", err);
    console.error("Full error details:", {
      message: err.message,
      sql: err.sql,
      code: err.code
    });
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch pending deposits",
      error: err.message
    });
  }
};

/* --------------------------------------------------
   ✅  ADMIN: Approve/Reject Deposit
-------------------------------------------------- */
/* --------------------------------------------------
   ✅  ADMIN: Process Deposit (Approval/Rejection)
-------------------------------------------------- */
exports.processDeposit = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { deposit_id, action, notes } = req.body; // action: 'approve' or 'reject'
    
    if (!deposit_id || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: "Valid deposit ID and action required" });
    }

    await connection.beginTransaction();

    // Get deposit with user info
    const [deposits] = await connection.execute(
      `SELECT d.*, u.name as user_name 
       FROM deposits d 
       JOIN users u ON d.user_id = u.id 
       WHERE d.id = ? AND d.status = 'pending'`,
      [deposit_id]
    );

    if (deposits.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Deposit not found or already processed" });
    }

    const deposit = deposits[0];
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    if (action === 'approve') {
      // ✅ Approve deposit - Credit user's wallet
      
      // Check if wallet exists, create if not
      const [walletCheck] = await connection.execute(
        "SELECT * FROM wallet WHERE user_id = ?",
        [deposit.user_id]
      );

      if (walletCheck.length === 0) {
        await connection.execute(
          "INSERT INTO wallet (user_id, balance) VALUES (?, ?)",
          [deposit.user_id, deposit.amount]
        );
      } else {
        // Credit existing wallet
        await connection.execute(
          "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
          [deposit.amount, deposit.user_id]
        );
      }

      // Update transaction record if exists
      try {
        await connection.execute(
          "UPDATE transactions SET status = 'completed' WHERE deposit_id = ?",
          [deposit_id]
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }

    } else {
      // ❌ Reject deposit
      // Update transaction record if exists
      try {
        await connection.execute(
          "UPDATE transactions SET status = 'failed' WHERE deposit_id = ?",
          [deposit_id]
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    }

    // Update deposit status
    await connection.execute(
      `UPDATE deposits 
       SET status = ?, approved_by = NULL, approved_at = NOW(), admin_notes = ?
       WHERE id = ?`,
      [newStatus, notes || null, deposit_id]
    );

    await connection.commit();

    // Get updated wallet balance if approved
    let newBalance = null;
    if (action === 'approve') {
      const [walletRows] = await db.execute(
        "SELECT balance FROM wallet WHERE user_id = ?",
        [deposit.user_id]
      );
      newBalance = walletRows[0]?.balance;
    }

    res.json({
      success: true,
      message: `Deposit ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: {
        deposit_id: deposit_id,
        status: newStatus,
        new_balance: newBalance
      }
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Process deposit error:", err);
    res.status(500).json({ message: "Failed to process deposit" });
  } finally {
    if (connection) connection.release();
  }
};

/* --------------------------------------------------
   ✅  ADMIN: Get All Pending Withdrawals
-------------------------------------------------- */
exports.getPendingWithdrawals = async (req, res) => {
  try {
    console.log("🔍 Pending withdrawals endpoint called");
    
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    console.log("Page:", page, "Limit:", limit, "Offset:", offset);

    console.log("📊 Fetching pending withdrawals from database...");

    // FIXED: Remove w.balance - it doesn't exist in withdrawals table
    const sql = `
      SELECT w.*, u.name as user_name, u.email, u.phone
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      WHERE w.status = 'pending'
      ORDER BY w.created_at ASC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;
    
    console.log("SQL Query:", sql);
    
    // Execute without parameters
    const [withdrawals] = await db.execute(sql);

    console.log(`📊 Found ${withdrawals.length} pending withdrawals`);

    // Get total count
    const [totalResult] = await db.execute(
      "SELECT COUNT(*) as total FROM withdrawals WHERE status = 'pending'"
    );

    const total = totalResult[0]?.total || 0;
    
    // Return simple data
    res.json({
      success: true,
      withdrawals: withdrawals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error("Get pending withdrawals error:", err);
    console.error("Full error details:", {
      message: err.message,
      sql: err.sql,
      code: err.code
    });
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch pending withdrawals",
      error: err.message
    });
  }
};

/* --------------------------------------------------
   ✅  ADMIN: Process Withdrawal
-------------------------------------------------- */
exports.processWithdrawal = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { withdrawal_id, action, transaction_reference, notes } = req.body;

    if (!withdrawal_id || !['approve', 'reject', 'mark_paid'].includes(action)) {
      return res.status(400).json({ 
        success: false,
        message: "Valid withdrawal ID and action required" 
      });
    }

    await connection.beginTransaction();

    // Get withdrawal with user info
    const [withdrawals] = await connection.execute(
      `SELECT w.*, u.name as user_name, u.email as user_email, u.phone as user_phone
       FROM withdrawals w
       JOIN users u ON w.user_id = u.id
       WHERE w.id = ? AND w.status = 'pending'`,
      [withdrawal_id]
    );

    if (withdrawals.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Withdrawal not found or already processed" 
      });
    }

    const withdrawal = withdrawals[0];
    let newStatus = 'pending';
    let message = "";

    if (action === 'reject') {
      // Reject withdrawal - Refund wallet
      newStatus = 'rejected';
      message = "Withdrawal rejected";
      
      // Refund the amount back to wallet
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [withdrawal.amount, withdrawal.user_id]
      );
      
      // Update transaction status if exists
      try {
        await connection.execute(
          "UPDATE transactions SET status = 'failed' WHERE withdrawal_id = ?",
          [withdrawal_id]
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    } 
    else if (action === 'approve') {
      // Approve withdrawal (no refund needed since we already deducted)
      newStatus = 'processing';
      message = "Withdrawal approved, ready for payment";
      
      // Update transaction status if exists
      try {
        await connection.execute(
          "UPDATE transactions SET status = 'processing' WHERE withdrawal_id = ?",
          [withdrawal_id]
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    }
    else if (action === 'mark_paid') {
      // Mark as paid (admin has made the transfer)
      if (!transaction_reference) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false,
          message: "Transaction reference is required when marking as paid" 
        });
      }

      newStatus = 'completed';
      message = "Withdrawal marked as completed";
      
      // Update transaction status if exists
      try {
        await connection.execute(
          "UPDATE transactions SET status = 'completed' WHERE withdrawal_id = ?",
          [withdrawal_id]
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    }

    // Update withdrawal status
    await connection.execute(
      `UPDATE withdrawals 
       SET status = ?, 
           processed_by = NULL, 
           processed_at = NOW(), 
           admin_notes = ?,
           transaction_reference = COALESCE(?, transaction_reference)
       WHERE id = ?`,
      [
        newStatus, 
        notes || null,
        transaction_reference || null,
        withdrawal_id
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      message: message,
      data: {
        withdrawal_id: withdrawal_id,
        status: newStatus,
        transaction_reference: transaction_reference
      }
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Process withdrawal error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to process withdrawal" 
    });
  } finally {
    if (connection) connection.release();
  }
};