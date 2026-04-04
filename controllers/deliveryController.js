const db = require("../config/db");
const { notifyUser, calculateDistance } = require("../utils/helpers");

// ✅ Get ALL registered delivery companies (removed location-based filtering and pricing)
exports.getAvailableDeliveryCompanies = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    console.log('🔍 Fetching all registered delivery companies');

    // Get all active delivery companies
    const [companies] = await db.execute(
      `SELECT id, user_id, company_name, coverage_area, state, local_government, phone_number,
              vehicle_type, description, status, created_at
       FROM delivery_companies 
       WHERE status = 'active'
       ORDER BY created_at DESC`
    );

    console.log('🏢 Found delivery companies:', companies.length);

    // Transform companies without pricing
    const allCompanies = companies.map((company) => {
      return {
        id: company.id,
        user_id: company.user_id,
        company_name: company.company_name,
        coverage_area: company.coverage_area,
        state: company.state,
        local_government: company.local_government,
        phone_number: company.phone_number,
        vehicle_type: company.vehicle_type,
        description: company.description,
        status: company.status,
        created_at: company.created_at,
        has_location: !!(company.latitude && company.longitude)
      };
    });

    res.status(200).json({ 
      success: true,
      message: "All registered delivery companies fetched successfully",
      companies: allCompanies,
      total: allCompanies.length
    });
  } catch (err) {
    console.error("❌ Error fetching delivery companies:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
};

// ✅ Request delivery — with negotiated price
exports.requestDelivery = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const buyerId = req.session.userId;
    const { orderId, deliveryCompanyId, address, agreedPrice } = req.body;

    if (!buyerId) {
      return res.status(401).json({ 
        success: false,
        message: "User not authenticated" 
      });
    }

    if (!agreedPrice || agreedPrice <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Please provide a valid agreed price for delivery" 
      });
    }

    const deliveryFee = parseFloat(agreedPrice);

    await conn.beginTransaction();

    // Get order and seller info with location from users table
    const [orderRows] = await conn.execute(
      `SELECT o.*, 
              p.title as product_title, 
              s.title as service_title,
              u.name as seller_name, 
              u.latitude as seller_latitude, 
              u.longitude as seller_longitude,
              buyer.name as buyer_name, 
              buyer.latitude as buyer_latitude, 
              buyer.longitude as buyer_longitude
       FROM orders o 
       LEFT JOIN users u ON o.seller_id = u.id 
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN services s ON o.service_id = s.id
       LEFT JOIN users buyer ON o.buyer_id = buyer.id
       WHERE o.id = ? AND o.buyer_id = ?`,
      [orderId, buyerId]
    );
    
    if (!orderRows.length) {
      await conn.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Order not found" 
      });
    }

    const order = orderRows[0];

    // Get product/service name
    const itemName = order.product_title || order.service_title || "Item";

    // Get delivery company
    const [deliveryRows] = await conn.execute(
      "SELECT * FROM delivery_companies WHERE id = ? AND status = 'active'",
      [deliveryCompanyId]
    );
    
    if (!deliveryRows.length) {
      await conn.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Delivery company not found" 
      });
    }

    const delivery = deliveryRows[0];

    // Update order with delivery information
    await conn.execute(
      `UPDATE orders 
       SET delivery_company_id = ?, 
           delivery_fee = ?, 
           delivery_status = 'assigned', 
           shipping_address = ?,
           delivery_notes = 'Agreed price: ₦${deliveryFee}'
       WHERE id = ?`,
      [deliveryCompanyId, deliveryFee, address, orderId]
    );

    // Deduct delivery fee from buyer wallet
    const [[wallet]] = await conn.execute(
      "SELECT balance FROM wallets WHERE user_id = ?",
      [buyerId]
    );
    
    if (!wallet || wallet.balance < deliveryFee) {
      await conn.rollback();
      return res.status(400).json({ 
        success: false,
        message: "Insufficient wallet balance for delivery fee" 
      });
    }

    await conn.execute(
      "UPDATE wallets SET balance = balance - ? WHERE user_id = ?",
      [deliveryFee, buyerId]
    );

    // Lock delivery fee in escrow
    await conn.execute(
      `INSERT INTO escrow (buyer_id, seller_id, order_id, amount, status, type)
       VALUES (?, ?, ?, ?, 'held', 'delivery')`,
      [buyerId, delivery.user_id, orderId, deliveryFee]
    );

    // Create a delivery record (if you have a deliveries table)
    // If you don't have a deliveries table, this can be skipped
    try {
      await conn.execute(
        `INSERT INTO deliveries (order_id, delivery_company_id, buyer_id, 
                                seller_id, delivery_fee, status, shipping_address)
         VALUES (?, ?, ?, ?, ?, 'assigned', ?)`,
        [orderId, deliveryCompanyId, buyerId, order.seller_id, deliveryFee, address]
      );
    } catch (deliveryError) {
      console.log("⚠️ No deliveries table or error:", deliveryError.message);
      // Continue without deliveries table
    }

    // ✅ ENHANCED NOTIFICATION SYSTEM
    // Notify DELIVERY AGENT
    await notifyUser(
      delivery.user_id,
      "New Delivery Assignment",
      `You have a new delivery request for "${itemName}" from ${order.seller_name}. Order #${orderId}. Agreed delivery fee: ₦${deliveryFee}`
    );

    // Notify SELLER
    await notifyUser(
      order.seller_id,
      "Delivery Scheduled",
      `A delivery agent has been assigned to pick up "${itemName}" for order #${orderId}. Delivery fee: ₦${deliveryFee}`
    );

    // Notify BUYER
    await notifyUser(
      buyerId,
      "Delivery Confirmed",
      `Your order #${orderId} is being processed. ${delivery.company_name} will deliver "${itemName}" to you soon.`
    );

    await conn.commit();
    
    res.status(200).json({
      success: true,
      message: "Delivery assigned successfully",
      deliveryFee,
      orderId,
      deliveryCompany: delivery.company_name
    });
  } catch (err) {
    await conn.rollback();
    console.error("❌ Delivery request error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  } finally {
    conn.release();
  }
};

// ✅ Confirm delivery (buyer triggers release)
exports.confirmDelivery = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const buyerId = req.session.userId;
    const { orderId } = req.body;

    if (!buyerId) {
      return res.status(401).json({ 
        success: false,
        message: "User not authenticated" 
      });
    }

    if (!orderId) {
      return res.status(400).json({ 
        success: false,
        message: "Order ID is required" 
      });
    }

    await conn.beginTransaction();

    // Get escrow for this order
    const [escrowRows] = await conn.execute(
      `SELECT e.*, dc.user_id as delivery_user_id 
       FROM escrow e
       LEFT JOIN orders o ON e.order_id = o.id
       LEFT JOIN delivery_companies dc ON o.delivery_company_id = dc.id
       WHERE e.order_id = ? AND e.status = 'held' AND e.type = 'delivery'`,
      [orderId]
    );
    
    if (!escrowRows.length) {
      await conn.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Escrow record not found for this order" 
      });
    }

    const escrow = escrowRows[0];

    if (!escrow.delivery_user_id) {
      await conn.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Delivery company not found for this order" 
      });
    }

    // Release funds to delivery agent
    await conn.execute(
      "UPDATE wallets SET balance = balance + ? WHERE user_id = ?",
      [escrow.amount, escrow.delivery_user_id]
    );

    // Update escrow status
    await conn.execute(
      "UPDATE escrow SET status = 'released', updated_at = NOW() WHERE id = ?",
      [escrow.id]
    );
    
    // Update order delivery status
    await conn.execute(
      "UPDATE orders SET delivery_status = 'delivered', updated_at = NOW() WHERE id = ?",
      [orderId]
    );
    
    // Update deliveries table if it exists
    try {
      await conn.execute(
        "UPDATE deliveries SET status = 'delivered', delivered_at = NOW() WHERE order_id = ?",
        [orderId]
      );
    } catch (error) {
      console.log("⚠️ No deliveries table to update");
    }

    // Notify delivery agent
    await notifyUser(
      escrow.delivery_user_id,
      "Delivery Payment Released",
      `Payment of ₦${escrow.amount} for order #${orderId} has been released to your wallet.`
    );

    // Notify buyer
    await notifyUser(
      buyerId,
      "Delivery Completed",
      `Delivery for order #${orderId} has been completed and payment released to the delivery agent.`
    );

    // Notify seller
    const [orderRows] = await conn.execute(
      "SELECT seller_id FROM orders WHERE id = ?",
      [orderId]
    );
    
    if (orderRows.length) {
      await notifyUser(
        orderRows[0].seller_id,
        "Delivery Completed",
        `Delivery for order #${orderId} has been completed successfully.`
      );
    }

    await conn.commit();
    
    res.status(200).json({ 
      success: true,
      message: "Delivery confirmed and funds released." 
    });
  } catch (err) {
    await conn.rollback();
    console.error("❌ Confirm delivery error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  } finally {
    conn.release();
  }
};