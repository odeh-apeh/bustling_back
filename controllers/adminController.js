const db = require("../config/db");
const bcrypt = require("bcryptjs");
const database = require("../database/database-handler");
const emailService = require("../helpers/email-service");
const otpTemplate = require("../helpers/html-template");

// ✅ Dashboard Stats
exports.getDashboardStats = async (req, res) => {
  try {
    console.log("📊 Dashboard endpoint called");

    let usersCount = 0,
      productsCount = 0,
      ordersCount = 0,
      servicesCount = 0;
    let totalRevenue = 0,
      pendingEscrows = 0,
      pendingDeposits = 0;
    let pendingWithdrawals = 0,
      pendingDisputes = 0;
    let recentTransactions = [];

    // 1. Users count
    try {
      const usersResult = await db.query("SELECT COUNT(*) as count FROM users");
      usersCount = parseInt(usersResult.rows[0]?.count) || 0;
    } catch (err) {
      console.error("Users query error:", err.message);
    }

    // 2. Products count
    try {
      const productsResult = await db.query(
        "SELECT COUNT(*) as count FROM products WHERE type='product'",
      );
      productsCount = parseInt(productsResult.rows[0]?.count) || 0;
    } catch (err) {
      console.error("Products query error:", err.message);
    }

    // 3. Orders count
    try {
      const ordersResult = await db.query(
        "SELECT COUNT(*) as count FROM orders",
      );
      ordersCount = parseInt(ordersResult.rows[0]?.count) || 0;
    } catch (err) {
      console.error("Orders query error:", err.message);
    }

    // 4. Services count
    try {
      const servicesResult = await db.query(
        "SELECT COUNT(*) as count FROM products WHERE type='service'",
      );
      servicesCount = parseInt(servicesResult.rows[0]?.count) || 0;
    } catch (err) {
      console.error("Services query error:", err.message);
    }

    // 5. Total revenue
    try {
      const revenueResult = await db.query(
        "SELECT COALESCE(SUM(amount), 0) as total FROM escrow WHERE status='released'",
      );
      totalRevenue = parseFloat(revenueResult.rows[0]?.total) || 0;
    } catch (err) {
      console.error("Revenue query error:", err.message);
    }

    // 6. Pending escrows
    try {
      const escrowsResult = await db.query(
        "SELECT COUNT(*) as count FROM escrow WHERE status='pending'",
      );
      pendingEscrows = parseInt(escrowsResult.rows[0]?.count) || 0;
    } catch (err) {
      console.error("Escrows query error:", err.message);
    }

    // 7. Pending deposits
    try {
      const depositsResult = await db.query(
        "SELECT COUNT(*) as count FROM deposits WHERE status='pending'",
      );
      pendingDeposits = parseInt(depositsResult.rows[0]?.count) || 0;
    } catch (err) {
      console.error("Deposits query error:", err.message);
    }

    // 8. Pending withdrawals
    try {
      const withdrawalsResult = await db.query(
        "SELECT COUNT(*) as count FROM withdrawals WHERE status='pending'",
      );
      pendingWithdrawals = parseInt(withdrawalsResult.rows[0]?.count) || 0;
    } catch (err) {
      console.error("Withdrawals query error:", err.message);
    }

    // 9. Pending disputes
    try {
      const disputesResult = await db.query(
        "SELECT COUNT(*) as count FROM orders WHERE dispute_status = 'open'",
      );
      pendingDisputes = parseInt(disputesResult.rows[0]?.count) || 0;
    } catch (err) {
      console.error("Disputes query error:", err.message);
    }

    // 10. Recent transactions - FIXED for your table structure
    try {
      const transactionsResult = await db.query(
        `
        SELECT 
          t.id, 
          t.amount, 
          t.type, 
          t.status, 
          t.created_at,
          t.sender_id,
          t.receiver_id,
          t.reference,
          COALESCE(sender.name, receiver.name, 'System') as user_name
        FROM transactions t 
        LEFT JOIN users sender ON t.sender_id = sender.id
        LEFT JOIN users receiver ON t.receiver_id = receiver.id
        ORDER BY t.created_at DESC 
        LIMIT $1
      `,
        [10],
      );

      recentTransactions = transactionsResult.rows || [];
    } catch (err) {
      console.error("Transactions query error:", err.message);
      recentTransactions = [];
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
        pendingDisputes: pendingDisputes,
      },
      recentTransactions: recentTransactions,
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ✅ User Management
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    // Build WHERE clause if search exists
    let whereClause = "";
    let params = [];
    let paramCounter = 1;

    if (search.trim()) {
      whereClause = " WHERE phone LIKE $1 OR name LIKE $1 OR email LIKE $1";
      const searchTerm = `%${search.trim()}%`;
      params = [searchTerm];
      paramCounter = 2;
    }

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM users${whereClause}`;
    const countResult = await db.query(countSql, params);
    const total = parseInt(countResult.rows[0]?.total) || 0;

    // Get users - include is_blocked field
    let usersSql = `
      SELECT u.*, 
             w.balance as wallet_balance,
             (SELECT COUNT(*) FROM products WHERE seller_id = u.id) as products_count,
             (SELECT COUNT(*) FROM orders WHERE buyer_id = u.id) as orders_count
      FROM users u
      LEFT JOIN wallet w ON u.id = w.user_id
      ${whereClause}
      ORDER BY u.id DESC 
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const usersParams = [...params, limit, offset];
    const usersResult = await db.query(usersSql, usersParams);
    const users = usersResult.rows;

    console.log(
      "Raw user data from DB (first user):",
      users[0]
        ? {
            id: users[0].id,
            name: users[0].name,
            is_blocked: users[0].is_blocked,
            type: users[0].type,
          }
        : "No users found",
    );

    // Format response - include is_blocked
    const formattedUsers = users.map((user) => {
      // Check if is_blocked exists and convert to boolean
      const isBlocked =
        user.is_blocked !== undefined
          ? Boolean(user.is_blocked)
          : user.type === "blocked"; // Fallback to type field

      return {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        type: user.type,
        location: user.location,
        wallet_balance: parseFloat(user.wallet_balance) || 0,
        products_count: parseInt(user.products_count) || 0,
        orders_count: parseInt(user.orders_count) || 0,
        created_at: user.created_at || new Date().toISOString(),
        status: isBlocked ? "blocked" : "active",
        is_blocked: isBlocked,
      };
    });

    res.json({
      users: formattedUsers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error in getAllUsers:", err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// Also update the updateUser function to match your schema
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_blocked, reason } = req.body;

    console.log("UPDATE USER REQUEST:", {
      userId,
      is_blocked,
      reason,
      body: req.body,
    });

    if (is_blocked === undefined) {
      return res.status(400).json({ message: "is_blocked parameter required" });
    }

    // Convert to boolean for database
    const blockedValue = Boolean(is_blocked);

    console.log("Updating user", userId, "is_blocked to:", blockedValue);

    // Update the user
    const result = await db.query(
      "UPDATE users SET is_blocked = $1, updated_at = NOW() WHERE id = $2",
      [blockedValue, userId],
    );

    console.log("Update result:", {
      rowCount: result.rowCount,
    });

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify the update worked
    const updatedUserResult = await db.query(
      "SELECT id, name, is_blocked FROM users WHERE id = $1",
      [userId],
    );
    const updatedUser = updatedUserResult.rows[0];

    console.log(
      "Verified update - user now has is_blocked:",
      updatedUser.is_blocked,
    );

    res.json({
      success: true,
      message: `User ${blockedValue ? "blocked" : "unblocked"} successfully`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        is_blocked: Boolean(updatedUser.is_blocked),
      },
    });
  } catch (err) {
    console.error("Update user error details:", {
      message: err.message,
      code: err.code,
      stack: err.stack,
    });

    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ✅ Product/Service Management - Get all products (both physical and services)
exports.getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      type = "",
      status = "",
    } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    const queryParams = [];
    let paramCounter = 1;

    if (search) {
      whereConditions.push(
        `(p.title ILIKE $${paramCounter} OR p.description ILIKE $${paramCounter})`,
      );
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (type) {
      whereConditions.push(`p.type = $${paramCounter}`);
      queryParams.push(type);
      paramCounter++;
    }

    if (status) {
      whereConditions.push(`p.status = $${paramCounter}`);
      queryParams.push(status);
      paramCounter++;
    }

    // Build WHERE clause
    let whereClause = "";
    if (whereConditions.length > 0) {
      whereClause = "WHERE " + whereConditions.join(" AND ");
    }

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM products p ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0]?.total) || 0;

    // Main query with parameterized limit/offset
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
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const productsParams = [...queryParams, parseInt(limit), parseInt(offset)];
    console.log("Params:", productsParams);

    const productsResult = await db.query(query, productsParams);
    const products = productsResult.rows;

    res.json({
      products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
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
    const { deleteType = "soft" } = req.body; // 'soft' or 'hard'

    // Check if product exists
    const productResult = await db.query(
      "SELECT * FROM products WHERE id = $1",
      [productId],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: "Product/Service not found" });
    }

    const product = productResult.rows[0];
    const productType = product.type === "service" ? "Service" : "Product";

    if (deleteType === "soft") {
      // Soft delete - mark as deleted
      await db.query(
        "UPDATE products SET status = 'deleted', deleted_at = NOW() WHERE id = $1",
        [productId],
      );
      res.json({
        message: `${productType} soft deleted successfully`,
        note: `${productType} marked as deleted but data preserved`,
      });
    } else if (deleteType === "hard") {
      // Hard delete - permanently remove
      // Check if product has active orders or escrow
      const activeOrdersResult = await db.query(
        "SELECT COUNT(*) as count FROM orders WHERE product_id = $1 AND status NOT IN ('completed', 'cancelled')",
        [productId],
      );

      const activeEscrowResult = await db.query(
        "SELECT COUNT(*) as count FROM escrow e JOIN orders o ON e.order_id = o.id WHERE o.product_id = $1 AND e.status = 'pending'",
        [productId],
      );

      if (
        parseInt(activeOrdersResult.rows[0].count) > 0 ||
        parseInt(activeEscrowResult.rows[0].count) > 0
      ) {
        return res.status(400).json({
          message: `Cannot delete ${productType.toLowerCase()} with active orders or pending escrow`,
        });
      }

      await db.query("DELETE FROM products WHERE id = $1", [productId]);
      res.json({
        message: `${productType} permanently deleted successfully`,
        warning: "This action cannot be undone",
      });
    } else {
      return res
        .status(400)
        .json({ message: "Invalid delete type. Use 'soft' or 'hard'" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Order Management
exports.getAllOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "",
      dispute_status = "",
    } = req.query;
    const offset = (page - 1) * limit;
    const pageLimit = parseInt(limit);
    const pageOffset = parseInt(offset);

    let whereConditions = [];
    const params = [];
    let paramCounter = 1;

    if (status) {
      whereConditions.push(`o.status = $${paramCounter}`);
      params.push(status);
      paramCounter++;
    }

    if (dispute_status) {
      whereConditions.push(`o.payment_status = $${paramCounter}`);
      params.push(dispute_status);
      paramCounter++;
    }

    const whereClause =
      whereConditions.length > 0
        ? "WHERE " + whereConditions.join(" AND ")
        : "";

    // Build the query dynamically
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
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const ordersParams = [...params, pageLimit, pageOffset];
    const ordersResult = await db.query(query, ordersParams);
    const orders = ordersResult.rows;

    // For count query
    const countQuery = `SELECT COUNT(*) as total FROM orders o ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total) || 0;

    res.json({
      orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: pageLimit,
        pages: Math.ceil(total / pageLimit),
      },
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
    const adminEmail = req.adminEmail || "System Admin";

    // Validate status - match your enum
    const validStatuses = [
      "pending",
      "paid",
      "shipped",
      "completed",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    await db.query(
      "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
      [status, orderId],
    );

    // Log the status change
    await db.query(
      "INSERT INTO order_logs (order_id, action, details, admin_info) VALUES ($1, $2, $3, $4)",
      [orderId, "status_update", `Status changed to ${status}`, adminEmail],
    );

    res.json({ message: "Order status updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get All Disputes with proper data
// controllers/admin.js - Fixed getAllDisputes

exports.getAllDisputes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "",
      dispute_type = "",
      search = "",
    } = req.query;

    const offset = (page - 1) * limit;
    const pageLimit = parseInt(limit);
    const pageOffset = parseInt(offset);

    let whereConditions = [];
    const queryParams = [];
    let paramCounter = 1;

    if (status) {
      whereConditions.push(`d.status = $${paramCounter}`);
      queryParams.push(status);
      paramCounter++;
    }

    if (dispute_type) {
      whereConditions.push(`d.dispute_type = $${paramCounter}`);
      queryParams.push(dispute_type);
      paramCounter++;
    }

    if (search) {
      // ✅ FIX: Join products table and use correct column names
      whereConditions.push(
        `(CAST(o.id AS TEXT) ILIKE $${paramCounter} OR r.name ILIKE $${paramCounter} OR du.name ILIKE $${paramCounter})`,
      );
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm);
      paramCounter++;
    }

    const whereClause =
      whereConditions.length > 0
        ? "WHERE " + whereConditions.join(" AND ")
        : "";

    // Get disputes with all related data - FIXED: Added products join
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
      JOIN products p ON o.product_id = p.id  -- ✅ ADD THIS JOIN
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
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const disputesParams = [...queryParams, pageLimit, pageOffset];
    const disputesResult = await db.query(disputesQuery, disputesParams);
    const disputes = disputesResult.rows;

    // Count query - FIXED: Also need products join here
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM disputes d
      JOIN orders o ON d.order_id = o.id
      JOIN users r ON d.raised_by_id = r.id
      JOIN users du ON d.disputed_user_id = du.id
      JOIN products p ON o.product_id = p.id
    `;

    if (whereConditions.length > 0) {
      countQuery += ` ${whereClause}`;
    }

    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0]?.total) || 0;

    // Format disputes for frontend
    const formattedDisputes = disputes.map((dispute) => ({
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
        role: dispute.raised_by_role,
      },
      disputed_user: {
        id: dispute.disputed_user_id,
        name: dispute.disputed_user_name,
        phone: dispute.disputed_user_phone,
        email: dispute.disputed_user_email,
      },
      product: {
        id: dispute.product_id,
        name: dispute.product_name,
        type: dispute.product_type,
        price: parseFloat(dispute.product_price) || 0,
      },
      order: {
        id: dispute.order_id,
        amount: parseFloat(dispute.order_amount) || 0,
        status: dispute.order_status,
        payment_status: dispute.payment_status,
        date: dispute.order_date,
      },
      escrow: {
        amount: parseFloat(dispute.escrow_amount) || 0,
        status: dispute.escrow_status,
        created: dispute.escrow_created,
      },
      evidence: dispute.evidence_urls ? JSON.parse(dispute.evidence_urls) : [],
      resolution: dispute.resolution,
      admin_notes: dispute.admin_notes,
      resolved_by: dispute.resolved_by_name,
      created_at: dispute.created_at,
      updated_at: dispute.updated_at,
      resolved_at: dispute.resolved_at,
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

    const statsResult = await db.query(statsQuery);
    const stats = statsResult.rows[0] || {};

    res.json({
      success: true,
      disputes: formattedDisputes,
      stats,
      pagination: {
        total,
        page: parseInt(page),
        limit: pageLimit,
        pages: Math.ceil(total / pageLimit),
      },
    });
  } catch (err) {
    console.error("Error in getAllDisputes:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
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
      WHERE d.id = $1
    `;

    const disputeResult = await db.query(disputeQuery, [disputeId]);
    const dispute = disputeResult.rows[0];

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    // Get dispute messages/comments
    const messagesResult = await db.query(
      `
      SELECT dm.*, u.name as user_name, u.role as user_role
      FROM dispute_messages dm
      JOIN users u ON dm.user_id = u.id
      WHERE dm.dispute_id = $1
      ORDER BY dm.created_at ASC
    `,
      [disputeId],
    );

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
        role: dispute.raised_by_role,
      },
      disputed_user: {
        id: dispute.disputed_user_id,
        name: dispute.disputed_user_name,
        phone: dispute.disputed_user_phone,
        email: dispute.disputed_user_email,
      },
      product: {
        id: dispute.product_id,
        name: dispute.product_name,
        type: dispute.product_type,
        price: parseFloat(dispute.product_price) || 0,
        description: dispute.product_description,
        image: dispute.product_image,
      },
      order: {
        id: dispute.order_id,
        amount: parseFloat(dispute.order_amount) || 0,
        status: dispute.order_status,
        payment_status: dispute.payment_status,
        shipping_address: dispute.shipping_address,
        delivery_status: dispute.delivery_status,
        delivery_company: dispute.delivery_company_id
          ? {
              id: dispute.delivery_company_id,
              name: dispute.delivery_company_name,
              phone: dispute.delivery_company_phone,
            }
          : null,
      },
      escrow: {
        amount: parseFloat(dispute.escrow_amount) || 0,
        status: dispute.escrow_status,
        created: dispute.escrow_created,
      },
      evidence: dispute.evidence_urls ? JSON.parse(dispute.evidence_urls) : [],
      resolution: dispute.resolution,
      admin_notes: dispute.admin_notes,
      resolved_by: dispute.resolved_by_name,
      messages: messagesResult.rows,
      created_at: dispute.created_at,
      updated_at: dispute.updated_at,
      resolved_at: dispute.resolved_at,
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

    await db.query(
      `INSERT INTO dispute_messages (dispute_id, user_id, message, is_internal, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [disputeId, userId, message.trim(), is_internal || false],
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

    const validStatuses = ["pending", "under_review", "resolved", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    await db.query(
      `UPDATE disputes 
       SET status = $1, 
           admin_notes = CONCAT(COALESCE(admin_notes, ''), '\n', $2),
           updated_at = NOW()
       WHERE id = $3`,
      [
        status,
        `[${new Date().toISOString()}] Status changed to ${status}: ${admin_notes || "No notes"}`,
        disputeId,
      ],
    );

    res.json({ message: "Dispute status updated successfully" });
  } catch (err) {
    console.error("Error in updateDisputeStatus:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Resolve Dispute with Escrow Action
exports.resolveDispute = async (req, res) => {
  const client = await db.getConnection();

  try {
    const { disputeId } = req.params;
    const { resolution, admin_notes, refund_amount } = req.body;
    const userId = req.session.userId;

    const validResolutions = [
      "release_to_seller",
      "refund_to_buyer",
      "partial_refund",
      "split_payment",
      "case_dismissed",
    ];
    if (!validResolutions.includes(resolution)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid resolution" });
    }

    await client.query("BEGIN");

    // Get dispute details with escrow info
    const disputeResult = await client.query(
      `
      SELECT d.*, e.amount as escrow_amount, e.buyer_id, e.seller_id, e.order_id
      FROM disputes d
      JOIN escrow e ON d.escrow_id = e.id
      WHERE d.id = $1 AND d.status != 'resolved'
    `,
      [disputeId],
    );

    const dispute = disputeResult.rows[0];

    if (!dispute) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Dispute not found or already resolved" });
    }

    // Handle different resolutions
    if (resolution === "release_to_seller") {
      // Release full amount to seller
      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [parseFloat(dispute.escrow_amount), dispute.seller_id],
      );
      await client.query(
        "UPDATE escrow SET status = 'released', released_at = NOW() WHERE id = $1",
        [dispute.escrow_id],
      );
    } else if (resolution === "refund_to_buyer") {
      // Refund full amount to buyer
      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [parseFloat(dispute.escrow_amount), dispute.buyer_id],
      );
      await client.query(
        "UPDATE escrow SET status = 'refunded', released_at = NOW() WHERE id = $1",
        [dispute.escrow_id],
      );
    } else if (resolution === "partial_refund") {
      const refundAmt =
        refund_amount || parseFloat(dispute.escrow_amount) * 0.5;
      const sellerAmt = parseFloat(dispute.escrow_amount) - refundAmt;

      // Refund partial to buyer
      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [refundAmt, dispute.buyer_id],
      );

      // Release rest to seller
      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [sellerAmt, dispute.seller_id],
      );

      await client.query(
        "UPDATE escrow SET status = 'partially_released', released_at = NOW() WHERE id = $1",
        [dispute.escrow_id],
      );
    } else if (resolution === "split_payment") {
      // 50/50 split
      const halfAmount = parseFloat(dispute.escrow_amount) / 2;

      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [halfAmount, dispute.buyer_id],
      );

      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [halfAmount, dispute.seller_id],
      );

      await client.query(
        "UPDATE escrow SET status = 'split_released', released_at = NOW() WHERE id = $1",
        [dispute.escrow_id],
      );
    }
    // case_dismissed - no money movement, just close dispute

    // Update dispute record
    await client.query(
      `UPDATE disputes 
       SET status = 'resolved',
           resolution = $1,
           resolved_by = $2,
           resolved_at = NOW(),
           admin_notes = CONCAT(COALESCE(admin_notes, ''), '\n', $3),
           updated_at = NOW()
       WHERE id = $4`,
      [
        resolution,
        userId,
        `[${new Date().toISOString()}] Dispute resolved: ${resolution}. ${admin_notes || "No additional notes"}`,
        disputeId,
      ],
    );

    // Update order dispute status
    await client.query(
      "UPDATE orders SET dispute_status = 'closed', updated_at = NOW() WHERE id = $1",
      [dispute.order_id],
    );

    await client.query("COMMIT");
    res.json({ message: "Dispute resolved successfully", resolution });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in resolveDispute:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    client.release();
  }
};

// ✅ Wallet & Transaction Monitoring
exports.getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type = "", user_id = "" } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    const params = [];
    let paramCounter = 1;

    if (type) {
      whereConditions.push(`t.type = $${paramCounter}`);
      params.push(type);
      paramCounter++;
    }

    if (user_id) {
      whereConditions.push(`t.user_id = $${paramCounter}`);
      params.push(user_id);
      paramCounter++;
    }

    const whereClause =
      whereConditions.length > 0
        ? "WHERE " + whereConditions.join(" AND ")
        : "";

    const transactionsQuery = `
      SELECT t.*, 
             u.name as user_name,
             u.phone as user_phone,
             w.balance as current_balance
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN wallet w ON t.user_id = w.user_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    const transactionsParams = [...params, parseInt(limit), offset];
    const transactionsResult = await db.query(
      transactionsQuery,
      transactionsParams,
    );
    const transactions = transactionsResult.rows;

    const countQuery = `SELECT COUNT(*) as total FROM transactions ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total) || 0;

    res.json({
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
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
      status = "",
      type = "",
      search = "",
      date_range = "all",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offsetNum = (pageNum - 1) * limitNum;

    // Build where conditions
    let whereConditions = [];
    let queryParams = [];
    let paramCounter = 1;

    if (status && status !== "all") {
      whereConditions.push(`e.status = $${paramCounter}`);
      queryParams.push(status);
      paramCounter++;
    }

    if (search) {
      whereConditions.push(
        `(CAST(e.id AS TEXT) ILIKE $${paramCounter} OR b.name ILIKE $${paramCounter} OR s.name ILIKE $${paramCounter} OR p.name ILIKE $${paramCounter})`,
      );
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm);
      paramCounter++;
    }

    // Date range filtering
    if (date_range !== "all") {
      let dateCondition = "";
      if (date_range === "today") {
        dateCondition = "DATE(e.created_at) = CURRENT_DATE";
      } else if (date_range === "week") {
        dateCondition = "e.created_at >= CURRENT_DATE - INTERVAL '7 days'";
      } else if (date_range === "month") {
        dateCondition = "e.created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }

      if (dateCondition) {
        whereConditions.push(dateCondition);
      }
    }

    const whereClause =
      whereConditions.length > 0
        ? "WHERE " + whereConditions.join(" AND ")
        : "";

    // Main escrows query
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
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    // Add LIMIT and OFFSET to parameters
    const escrowsParams = [...queryParams, limitNum, offsetNum];

    console.log("Escrows Params:", escrowsParams);

    const escrowsResult = await db.query(escrowsQuery, escrowsParams);
    const escrows = escrowsResult.rows;

    // Stats query - separate from main query parameters
    let statsConditions = [];
    let statsParams = [];
    let statsParamCounter = 1;

    if (status && status !== "all") {
      statsConditions.push(`status = $${statsParamCounter}`);
      statsParams.push(status);
      statsParamCounter++;
    }

    if (search) {
      statsConditions.push(`CAST(id AS TEXT) ILIKE $${statsParamCounter}`);
      statsParams.push(`%${search}%`);
      statsParamCounter++;
    }

    if (date_range !== "all") {
      let dateCondition = "";
      if (date_range === "today") {
        dateCondition = "DATE(created_at) = CURRENT_DATE";
      } else if (date_range === "week") {
        dateCondition = "created_at >= CURRENT_DATE - INTERVAL '7 days'";
      } else if (date_range === "month") {
        dateCondition = "created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }

      if (dateCondition) {
        statsConditions.push(dateCondition);
      }
    }

    const statsWhereClause =
      statsConditions.length > 0
        ? "WHERE " + statsConditions.join(" AND ")
        : "";

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

    console.log("Stats Params:", statsParams);

    const statsResult = await db.query(statsQuery, statsParams);
    const stats = statsResult.rows[0] || {};

    // Format the response - ensure all fields are properly converted
    const formattedEscrows = escrows.map((escrow) => ({
      id: escrow.id ? escrow.id.toString() : "", // Convert to string
      buyer_id: escrow.buyer_id,
      seller_id: escrow.seller_id,
      transaction_id: escrow.transaction_id,
      order_id: escrow.order_id,
      delivery_id: escrow.delivery_id,
      amount: parseFloat(escrow.amount) || 0,
      status: escrow.status || "pending",
      created_at: escrow.created_at,
      released_at: escrow.released_at,
      buyer_name: escrow.buyer_name || "Unknown Buyer",
      buyer_phone: escrow.buyer_phone || "",
      seller_name: escrow.seller_name || "Unknown Seller",
      seller_phone: escrow.seller_phone || "",
      product_name: escrow.product_name || "Unknown Product",
      order_status: escrow.order_status || "",
      payment_status: escrow.payment_status || "",
      delivery_company: escrow.delivery_company || "",
      delivery_status: escrow.delivery_status || "",
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
        pending_amount: parseFloat(stats.pending_amount) || 0,
      },
      pagination: {
        total: parseInt(stats.total) || 0,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil((parseInt(stats.total) || 0) / limitNum),
      },
    });
  } catch (err) {
    console.error("Error in getAllEscrows:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ✅ Your existing release/refund escrow functions
exports.releaseEscrow = async (req, res) => {
  const client = await db.getConnection();
  try {
    const { escrowId } = req.body;

    await client.query("BEGIN");

    // Find escrow
    const escrowResult = await client.query(
      "SELECT * FROM escrow WHERE id = $1",
      [escrowId],
    );
    if (escrowResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Escrow not found" });
    }

    const escrow = escrowResult.rows[0];
    if (escrow.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Escrow already resolved" });
    }

    // Credit seller
    await client.query(
      "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
      [parseFloat(escrow.amount), escrow.seller_id],
    );

    // Update escrow
    await client.query(
      "UPDATE escrow SET status = 'released', released_at = NOW() WHERE id = $1",
      [escrowId],
    );

    await client.query("COMMIT");
    res.json({ message: "Escrow released to seller" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Release Escrow Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    client.release();
  }
};

exports.refundEscrow = async (req, res) => {
  const client = await db.getConnection();
  try {
    const { escrowId } = req.body;

    await client.query("BEGIN");

    // Find escrow
    const escrowResult = await client.query(
      "SELECT * FROM escrow WHERE id = $1",
      [escrowId],
    );
    if (escrowResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Escrow not found" });
    }

    const escrow = escrowResult.rows[0];
    if (escrow.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Escrow already resolved" });
    }

    // Refund buyer
    await client.query(
      "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
      [parseFloat(escrow.amount), escrow.buyer_id],
    );

    // Update escrow
    await client.query(
      "UPDATE escrow SET status = 'refunded', released_at = NOW() WHERE id = $1",
      [escrowId],
    );

    await client.query("COMMIT");
    res.json({ message: "Escrow refunded to buyer" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Refund Escrow Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    client.release();
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
      WHERE e.id = $1
    `;

    const escrowResult = await db.query(escrowQuery, [escrowId]);
    const escrow = escrowResult.rows[0];

    if (!escrow) {
      return res.status(404).json({ message: "Escrow not found" });
    }

    res.json({ escrow });
  } catch (err) {
    console.error("Error in getEscrowById:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update escrow status
exports.updateEscrowStatus = async (req, res) => {
  const client = await db.getConnection();

  try {
    const { escrowId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = [
      "pending",
      "released",
      "disputed",
      "refunded",
      "held",
    ];
    if (!validStatuses.includes(status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid status" });
    }

    await client.query("BEGIN");

    // Get current escrow
    const escrowResult = await client.query(
      "SELECT * FROM escrow WHERE id = $1",
      [escrowId],
    );

    if (escrowResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Escrow not found" });
    }

    const escrow = escrowResult.rows[0];

    // Update escrow status
    await client.query(
      `UPDATE escrow 
       SET status = $1, 
           updated_at = NOW(),
           released_at = CASE WHEN $1 IN ('released', 'refunded') THEN NOW() ELSE released_at END,
           notes = CONCAT(COALESCE(notes, ''), '\n', $2)
       WHERE id = $3`,
      [
        status,
        `[${new Date().toISOString()}] Status changed to ${status}: ${notes || "No notes"}`,
        escrowId,
      ],
    );

    // Update related transaction if needed
    if (status === "released" || status === "refunded") {
      await client.query("UPDATE transactions SET status = $1 WHERE id = $2", [
        status === "released" ? "completed" : "refunded",
        escrow.transaction_id,
      ]);
    }

    // Log the status change
    await client.query(
      `INSERT INTO escrow_logs (escrow_id, action, details, admin_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        escrowId,
        "status_update",
        `Status changed to ${status}: ${notes || "No notes"}`,
        req.session.user?.id || 0,
      ],
    );

    await client.query("COMMIT");
    res.json({ message: "Escrow status updated successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in updateEscrowStatus:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    client.release();
  }
};

//========================================================//
exports.getAllAdmins = async (req, res) => {
  try {
    const data = await database.findAll({
      table: "admin",
      hasAttribute: false,
    });
    if (!data) {
      return res.status(500).json({
        success: false,
        message: "No admins available",
        data: null,
      });
    }
    return res.status(201).json({
      success: true,
      message: "Processed Successfully",
      data: data,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message, data: null });
  }
};
exports.saveAdminDetails = async (req, res) => {
  const { name, username, email, phone, password, factor } = req.body;

  // Basic validation
  if (!name || !username || !email || !phone || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const result = await database.insert({
      table: "admin",
      data: {
        name,
        username,
        email,
        phone,
        password: hashedPassword, // In production, hash the password before saving
        factor: factor || false,
        otp: "",
      },
    });

    if (!result) {
      console.error("Error in saveAdminDetails:", err);
      res
        .status(500)
        .json({ success: false, message: "An error has occured", data: null });
    }

    return res.status(201).json({
      success: true,
      message: "Credentials saved successfully",
      data: result,
    });
  } catch (err) {
    console.error("Error in saveAdminDetails:", err);
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

exports.updateAdminDetails = async (req, res) => {
  const {
    name,
    username,
    email,
    phone,
    password,
    factor,
    id,
    currentPassword,
  } = req.body;

  // Basic validation
  if (!name || !username || !email || !phone || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const data = await database.findOneById({
      table: "admin",
      attribute: "id",
      item: "id, password",
      id: id,
    });
    const check = await bcrypt.compare(currentPassword, data.password);
    if (!check) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Current password is Incorrect",
          data: null,
        });
    }
    const result = await database.updateById({
      table: "admin",
      data: {
        name,
        username,
        email,
        phone,
        password: hashedPassword, // In production, hash the password before saving
        factor: factor || false,
        otp: "",
      },
      attribute: "id",
      id: id,
    });

    if (!result) {
      console.error("Error in saveAdminDetails:", err);
      res
        .status(500)
        .json({ success: false, message: "An error has occured", data: null });
    }

    return res.status(201).json({
      success: true,
      message: "Credentials updated successfully",
      data: result,
    });
  } catch (err) {
    console.error("Error in saveAdminDetails:", err);
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

exports.fetchAdminDetails = async (req, res) => {
  try {
    const data = await database.findAll({
      table: "admin",
      hasAttribute: false,
    });
    if (!data) {
      return res
        .status(500)
        .json({
          success: false,
          message: "No records in database",
          data: null,
        });
    }
    return res.status(201).json({
      success: true,
      message: "Processed Successfully",
      data: data,
    });
  } catch (e) {
    console.error("Error in geting admin details:", err);
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

exports.deleteAdmin = async (req, res) => {
  const { id } = req.body;
  try {
    const data = await database.deleteById({
      table: "admin",
      id: id,
      attribute: "id",
    });
    return res.status(201).json({
      success: true,
      message: "Admin deleted successfully",
      data: null,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: err.message, data: null });
  }
};

function generateCode() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  return otp;
}

exports.sendOtp = async (req, res) => {
  const { email } = req.params;
  const code = generateCode();

  const data = await database.findOneByEmail({
    table: "admin",
    item: "email",
    attribute: "email",
    email: email,
  });
  if (!data) {
    return res.status(500).json({
      success: false,
      message: "User does not exists",
      data: null,
    });
  }
  try {
    const html = otpTemplate({
      code: code,
      title: "Two factor authentication",
      appName: "Bustling Admin",
      expiresIn: "10 minutes",
    });
    const mail = await emailService.sendEmail({
      to: email,
      subject: "Two factor authentication",
      htmlContent: html,
      textContent: `Your verification code is ${otp}. It expires in 10 minutes.`,
    });
    if (!mail.success) {
      return res.status(500).json({
        success: false,
        message: mail.error,
        data: null,
      });
    }

    await database.updateByEmail({
      table: "admin",
      data: {
        otp: code,
      },
      email: email,
    });
    res.status(201).json({
      success: true,
      message: "Otp sent successfully",
      data: null,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message, data: null });
  }
};

exports.verifyCode = async (req, res) => {
  const { email, code } = req.body;
  try {
    const data = await database.findOneByEmail({
      email: email,
      table: "admin",
      attribute: "email",
      item: "otp",
    });
    if (!data) {
      return res.status(400).json({
        success: false,
        message: "User not found",
        data: null,
      });
    }

    if (data.otp !== code) {
      return res.status(400).json({
        success: false,
        message: "Invalid code",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Code verified successfully",
      data: null,
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
      data: null,
    });
  }
};

exports.findOneAdmin = async(req, res) => {
  const {id} = req.params;
  try{
    const data = await database.findOneById({
      table:'admin',
      id:id,
      attribute:'id'
    });
    return res.status(201).json({
      success:false,
      message: 'Processed Successfully',
      data: data
    });
  }catch(e){
    res.status(500).json({
      success: false,
      message: e.message,
      data: null,
    });
  }
}

//========================================================//

exports.adminLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: "Phone and password required" });
    }

    const data = await database.findOne({
      table: "admin",
      attribute: "phone",
      item: "id, password, phone, email, name",
      value: phone,
    });
    // 1. Check if user even exists
    if (!data) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid Credentials" });
    }

    // 2. AWAIT the comparison
    const isPasswordCorrect = await bcrypt.compare(password, data.password);

    if (!isPasswordCorrect) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid Credentials" });
    }

    // Set session with hardcoded admin user
    req.session.user = {
      id: data.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      role: "admin",
      is_super_admin: true,
    };

    res.json({
      message: "Admin login successful",
      user: req.session.user,
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
exports.getPendingDeposits = async (req, res) => {
  try {
    console.log("🔍 Pending deposits endpoint called");

    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    console.log("Page:", page, "Limit:", limit, "Offset:", offset);

    console.log("📊 Fetching pending deposits from database...");

    // PostgreSQL query with parameterized LIMIT/OFFSET
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
      LIMIT $1 OFFSET $2
    `;

    console.log("SQL Query:", sql);

    // Execute with parameters
    const depositsResult = await db.query(sql, [
      parseInt(limit),
      parseInt(offset),
    ]);
    const deposits = depositsResult.rows;

    console.log(`📊 Found ${deposits.length} pending deposits`);

    // Get total count
    const totalResult = await db.query(
      "SELECT COUNT(*) as total FROM deposits WHERE status = 'pending'",
    );

    const total = parseInt(totalResult.rows[0]?.total) || 0;

    // Return simple data
    res.json({
      success: true,
      deposits: deposits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get pending deposits error:", err);
    console.error("Full error details:", {
      message: err.message,
      code: err.code,
    });
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending deposits",
      error: err.message,
    });
  }
};

/* --------------------------------------------------
   ✅  ADMIN: Approve/Reject Deposit
-------------------------------------------------- */
exports.processDeposit = async (req, res) => {
  const client = await db.getConnection();

  try {
    const { deposit_id, action, notes } = req.body; // action: 'approve' or 'reject'

    if (!deposit_id || !["approve", "reject"].includes(action)) {
      return res
        .status(400)
        .json({ message: "Valid deposit ID and action required" });
    }

    await client.query("BEGIN");

    // Get deposit with user info
    const depositsResult = await client.query(
      `SELECT d.*, u.name as user_name 
       FROM deposits d 
       JOIN users u ON d.user_id = u.id 
       WHERE d.id = $1 AND d.status = 'pending'`,
      [deposit_id],
    );

    if (depositsResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Deposit not found or already processed" });
    }

    const deposit = depositsResult.rows[0];
    const newStatus = action === "approve" ? "approved" : "rejected";

    if (action === "approve") {
      // ✅ Approve deposit - Credit user's wallet

      // Check if wallet exists, create if not
      const walletCheck = await client.query(
        "SELECT * FROM wallet WHERE user_id = $1",
        [deposit.user_id],
      );

      if (walletCheck.rows.length === 0) {
        await client.query(
          "INSERT INTO wallet (user_id, balance) VALUES ($1, $2)",
          [deposit.user_id, parseFloat(deposit.amount)],
        );
      } else {
        // Credit existing wallet
        await client.query(
          "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
          [parseFloat(deposit.amount), deposit.user_id],
        );
      }

      // Update transaction record if exists
      try {
        await client.query(
          "UPDATE transactions SET status = 'completed' WHERE deposit_id = $1",
          [deposit_id],
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    } else {
      // ❌ Reject deposit
      // Update transaction record if exists
      try {
        await client.query(
          "UPDATE transactions SET status = 'failed' WHERE deposit_id = $1",
          [deposit_id],
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    }

    // Update deposit status
    await client.query(
      `UPDATE deposits 
       SET status = $1, approved_by = NULL, approved_at = NOW(), admin_notes = $2
       WHERE id = $3`,
      [newStatus, notes || null, deposit_id],
    );

    await client.query("COMMIT");

    // Get updated wallet balance if approved
    let newBalance = null;
    if (action === "approve") {
      const walletRows = await db.query(
        "SELECT balance FROM wallet WHERE user_id = $1",
        [deposit.user_id],
      );
      newBalance = walletRows.rows[0]?.balance;
    }

    res.json({
      success: true,
      message: `Deposit ${action === "approve" ? "approved" : "rejected"} successfully`,
      data: {
        deposit_id: deposit_id,
        status: newStatus,
        new_balance: newBalance ? parseFloat(newBalance) : null,
      },
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("Process deposit error:", err);
    res.status(500).json({ message: "Failed to process deposit" });
  } finally {
    if (client) client.release();
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

    // PostgreSQL query with parameterized LIMIT/OFFSET
    const sql = `
      SELECT w.*, u.name as user_name, u.email, u.phone
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      WHERE w.status = 'pending'
      ORDER BY w.created_at ASC
      LIMIT $1 OFFSET $2
    `;

    console.log("SQL Query:", sql);

    // Execute with parameters
    const withdrawalsResult = await db.query(sql, [
      parseInt(limit),
      parseInt(offset),
    ]);
    const withdrawals = withdrawalsResult.rows;

    console.log(`📊 Found ${withdrawals.length} pending withdrawals`);

    // Get total count
    const totalResult = await db.query(
      "SELECT COUNT(*) as total FROM withdrawals WHERE status = 'pending'",
    );

    const total = parseInt(totalResult.rows[0]?.total) || 0;

    // Return simple data
    res.json({
      success: true,
      withdrawals: withdrawals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get pending withdrawals error:", err);
    console.error("Full error details:", {
      message: err.message,
      code: err.code,
    });
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending withdrawals",
      error: err.message,
    });
  }
};

/* --------------------------------------------------
   ✅  ADMIN: Process Withdrawal
-------------------------------------------------- */
exports.processWithdrawal = async (req, res) => {
  const client = await db.getConnection();

  try {
    const { withdrawal_id, action, transaction_reference, notes } = req.body;

    if (
      !withdrawal_id ||
      !["approve", "reject", "mark_paid"].includes(action)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid withdrawal ID and action required",
      });
    }

    await client.query("BEGIN");

    // Get withdrawal with user info
    const withdrawalsResult = await client.query(
      `SELECT w.*, u.name as user_name, u.email as user_email, u.phone as user_phone
       FROM withdrawals w
       JOIN users u ON w.user_id = u.id
       WHERE w.id = $1 AND w.status = 'pending'`,
      [withdrawal_id],
    );

    if (withdrawalsResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Withdrawal not found or already processed",
      });
    }

    const withdrawal = withdrawalsResult.rows[0];
    let newStatus = "pending";
    let message = "";

    if (action === "reject") {
      // Reject withdrawal - Refund wallet
      newStatus = "rejected";
      message = "Withdrawal rejected";

      // Refund the amount back to wallet
      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [parseFloat(withdrawal.amount), withdrawal.user_id],
      );

      // Update transaction status if exists
      try {
        await client.query(
          "UPDATE transactions SET status = 'failed' WHERE withdrawal_id = $1",
          [withdrawal_id],
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    } else if (action === "approve") {
      // Approve withdrawal (no refund needed since we already deducted)
      newStatus = "processing";
      message = "Withdrawal approved, ready for payment";

      // Update transaction status if exists
      try {
        await client.query(
          "UPDATE transactions SET status = 'processing' WHERE withdrawal_id = $1",
          [withdrawal_id],
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    } else if (action === "mark_paid") {
      // Mark as paid (admin has made the transfer)
      if (!transaction_reference) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Transaction reference is required when marking as paid",
        });
      }

      newStatus = "completed";
      message = "Withdrawal marked as completed";

      // Update transaction status if exists
      try {
        await client.query(
          "UPDATE transactions SET status = 'completed' WHERE withdrawal_id = $1",
          [withdrawal_id],
        );
      } catch (err) {
        console.log("No transaction record to update:", err.message);
      }
    }

    // Update withdrawal status
    await client.query(
      `UPDATE withdrawals 
       SET status = $1, 
           processed_by = NULL, 
           processed_at = NOW(), 
           admin_notes = $2,
           transaction_reference = COALESCE($3, transaction_reference)
       WHERE id = $4`,
      [newStatus, notes || null, transaction_reference || null, withdrawal_id],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: message,
      data: {
        withdrawal_id: withdrawal_id,
        status: newStatus,
        transaction_reference: transaction_reference,
      },
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("Process withdrawal error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to process withdrawal",
    });
  } finally {
    if (client) client.release();
  }
};
