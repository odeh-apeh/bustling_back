// backend/controllers/walletController.js
const db = require("../config/db");
const axios = require("axios");
const crypto = require("crypto");

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Use 0 (system) or env for system user
const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID || 0;

const generateInvoiceNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `INV-${timestamp}-${random}`;
};

/* --------------------------------------------------
   ✅  Get Wallet Balance
-------------------------------------------------- */
exports.getBalance = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await db.query(
      "SELECT * FROM wallet WHERE user_id = $1",
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    res.json({ balance: result.rows[0].balance });
  } catch (err) {
    console.error("Get Balance Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getDepositAccount = async (req, res) => {
  try {
    // Return your business bank account details
    const depositAccount = {
      bank_name: process.env.DEPOSIT_BANK_NAME || "Moniepoint mfb",
      account_number: process.env.DEPOSIT_ACCOUNT_NUMBER || "9036361445",
      account_name: process.env.DEPOSIT_ACCOUNT_NAME || "Errandly Enterprises",
      instructions: process.env.DEPOSIT_INSTRUCTIONS || 
        `1. Copy the invoice number\n2. Make transfer to the account above\n3. Use invoice number as narration\n4. Upload proof of payment`
    };
    
    res.json({
      success: true,
      account: depositAccount
    });
  } catch (err) {
    console.error("Get deposit account error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* --------------------------------------------------
   ✅  Request Deposit (Generate Invoice)
-------------------------------------------------- */
exports.fundWallet = async (req, res) => {
  const client = await db.getConnection();
  
  try {
    console.log('✅ Deposit request received from user:', req.session.userId);
    
    if (!req.session.userId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized. Please login again." 
      });
    }

    const { amount } = req.body;
    const userId = req.session.userId;

    console.log('📝 Amount requested:', amount);

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Valid amount is required" 
      });
    }

    // Convert amount to number
    const amountNum = parseFloat(amount);
    
    if (isNaN(amountNum)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid amount format" 
      });
    }

    // Minimum and maximum deposit validation
    const MIN_DEPOSIT = 100; // ₦100 minimum
    const MAX_DEPOSIT = 5000000; // ₦5 million maximum
    
    if (amountNum < MIN_DEPOSIT) {
      return res.status(400).json({ 
        success: false,
        message: `Minimum deposit amount is ₦${MIN_DEPOSIT}` 
      });
    }
    
    if (amountNum > MAX_DEPOSIT) {
      return res.status(400).json({ 
        success: false,
        message: `Maximum deposit amount is ₦${MAX_DEPOSIT.toLocaleString()}` 
      });
    }

    await client.query('BEGIN');
    console.log('🔒 Transaction started');

    // Generate unique invoice number
    let invoiceNumber = generateInvoiceNumber();
    console.log('📄 Generated invoice:', invoiceNumber);
    
    // Check for duplicate invoice (unlikely but safe)
    const existingInvoice = await client.query(
      "SELECT id FROM deposits WHERE invoice_number = $1",
      [invoiceNumber]
    );
    
    if (existingInvoice.rows.length > 0) {
      // Regenerate if duplicate
      invoiceNumber = generateInvoiceNumber();
      console.log('🔄 Regenerated invoice:', invoiceNumber);
    }

    // Create deposit request
    console.log('💾 Creating deposit record...');
    const result = await client.query(
      `INSERT INTO deposits 
       (user_id, invoice_number, amount, status) 
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [userId, invoiceNumber, amountNum]
    );

    const depositId = result.rows[0].id;
    console.log('✅ Deposit created with ID:', depositId);

    // Get SYSTEM_USER_ID (usually 0 for system transactions)
    const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID || 0;

    // Log transaction (commented out as in original)
    /*await client.query(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, deposit_id) 
       VALUES ($1, $2, $3, 'deposit', 'pending', $4)`,
      [userId, SYSTEM_USER_ID, amountNum, depositId]
    );
    console.log('📝 Transaction logged');*/

    // Get deposit account details from environment variables or use defaults
    const depositAccount = {
      bank_name: process.env.DEPOSIT_BANK_NAME || "Moniepoint mfb",
      account_number: process.env.DEPOSIT_ACCOUNT_NUMBER || "9036361445",
      account_name: process.env.DEPOSIT_ACCOUNT_NAME || "Errandly Enterprises",
    };

    await client.query('COMMIT');
    console.log('✅ Transaction committed');

    res.json({
      success: true,
      message: "Deposit request created successfully",
      data: {
        deposit_id: depositId,
        invoice_number: invoiceNumber,
        amount: amountNum,
        status: 'pending',
        bank_account: depositAccount,
        instructions: `Make transfer to the account above and use "${invoiceNumber}" as narration/remark`
      }
    });

  } catch (err) {
    console.error("❌ Request deposit error:", err);
    console.error("❌ Error details:", err.message);
    
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('🔄 Transaction rolled back');
      } catch (rollbackErr) {
        console.error('❌ Rollback error:', rollbackErr);
      }
    }
    
    res.status(500).json({ 
      success: false,
      message: "Failed to create deposit request",
    });
  } finally {
    if (client) {
      try {
        client.release();
        console.log('🔓 Connection released');
      } catch (releaseErr) {
        console.error('❌ Connection release error:', releaseErr);
      }
    }
  }
};

exports.requestWithdrawal = async (req, res) => {
  const client = await db.getConnection();
  
  try {
    console.log("Withdrawal request - Session userId:", req.session.userId);
    console.log("Withdrawal request body:", req.body);
    
    // Get userId from SESSION (not from request body)
    if (!req.session.userId) {
      return res.status(401).json({ 
        success: false,
        message: "Please login first" 
      });
    }

    const userId = req.session.userId;
    
    const { 
      amount, 
      bank_name, 
      bank_code, 
      account_number, 
      account_name 
    } = req.body;

    console.log("Using userId from session:", userId, "Amount:", amount);

    // Validate required fields (NO userId in body validation)
    if (!amount || !bank_name || !account_number || !account_name) {
      return res.status(400).json({ 
        success: false,
        message: "Amount, bank name, account number, and account name are required" 
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid amount" 
      });
    }

    // Validate account number
    if (!/^\d+$/.test(account_number)) {
      return res.status(400).json({ 
        success: false,
        message: "Account number must contain only digits" 
      });
    }

    if (account_number.length < 10 || account_number.length > 20) {
      return res.status(400).json({ 
        success: false,
        message: "Account number must be between 10-20 digits" 
      });
    }

    // Minimum and maximum withdrawal validation
    const MIN_WITHDRAWAL = 100;
    const MAX_WITHDRAWAL = 5000000;
    
    if (amountNum < MIN_WITHDRAWAL) {
      return res.status(400).json({ 
        success: false,
        message: `Minimum withdrawal amount is ₦${MIN_WITHDRAWAL}` 
      });
    }
    
    if (amountNum > MAX_WITHDRAWAL) {
      return res.status(400).json({ 
        success: false,
        message: `Maximum withdrawal amount is ₦${MAX_WITHDRAWAL.toLocaleString()}` 
      });
    }

    await client.query('BEGIN');

    // Check wallet balance
    const walletResult = await client.query(
      "SELECT balance FROM wallet WHERE user_id = $1",
      [userId]
    );
    
    if (walletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        message: "Wallet not found" 
      });
    }
    
    const wallet = walletResult.rows[0];
    
    // Check if user has sufficient balance
    if (parseFloat(wallet.balance) < amountNum) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false,
        message: `Insufficient funds. Available: ₦${parseFloat(wallet.balance).toLocaleString()}` 
      });
    }

    // Create withdrawal request
    const result = await client.query(
      `INSERT INTO withdrawals 
       (user_id, amount, bank_name, bank_code, account_number, account_name) 
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        userId, 
        amountNum, 
        bank_name, 
        bank_code || '', 
        account_number, 
        account_name
      ]
    );

    const withdrawalId = result.rows[0].id;

    // Deduct amount from wallet
    await client.query(
      "UPDATE wallet SET balance = balance - $1 WHERE user_id = $2",
      [amountNum, userId]
    );

    // Create transaction record (commented out as in original)
   /* try {
      await client.query(
        `INSERT INTO transactions 
         (user_id, amount, type, status, withdrawal_id, description) 
         VALUES ($1, $2, 'withdrawal', 'pending', $3, $4)`,
        [
          userId, 
          amountNum,
          withdrawalId,
          `Withdrawal request to ${bank_name}`
        ]
      );
    } catch (txnErr) {
      console.log("Note: Could not create transaction record:", txnErr.message);
      // Continue even if transaction record fails
    }*/

    await client.query('COMMIT');

    // Get updated balance
    const updatedWallet = await client.query(
      "SELECT balance FROM wallet WHERE user_id = $1",
      [userId]
    );

    res.json({
      success: true,
      message: "Withdrawal request submitted for admin approval",
      data: {
        withdrawal_id: withdrawalId,
        amount: amountNum,
        bank_details: {
          bank_name: bank_name,
          account_name: account_name,
          account_number: account_number
        },
        status: 'pending',
        previous_balance: parseFloat(wallet.balance),
        new_balance: parseFloat(updatedWallet.rows[0].balance),
        created_at: new Date().toISOString()
      }
    });

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error("Request withdrawal error details:", {
      message: err.message,
      code: err.code
    });
    res.status(500).json({ 
      success: false,
      message: "Failed to create withdrawal request",
      error: err.message
    });
  } finally {
    if (client) client.release();
  }
};

/* --------------------------------------------------
   ✅  Get User Deposit History
-------------------------------------------------- */
exports.getUserDeposits = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.session.userId;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    const pageLimit = parseInt(limit);
    const pageOffset = parseInt(offset);

    let query = `
      SELECT d.*, u.name as user_name, u.email, 
             admin.name as approved_by_name
      FROM deposits d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN users admin ON d.approved_by = admin.id
      WHERE d.user_id = $1
    `;
    
    const params = [userId];
    let paramCounter = 2;
    
    if (status && ['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      query += ` AND d.status = $${paramCounter}`;
      params.push(status);
      paramCounter++;
    }
    
    query += ` ORDER BY d.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(pageLimit, pageOffset);

    const depositsResult = await db.query(query, params);
    const deposits = depositsResult.rows;

    // Count query
    let countQuery = `SELECT COUNT(*) as total FROM deposits WHERE user_id = $1`;
    const countParams = [userId];
    
    if (status && ['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      countQuery += ` AND status = $2`;
      countParams.push(status);
    }
    
    const totalResult = await db.query(countQuery, countParams);

    res.json({
      success: true,
      deposits: deposits.map(d => ({
        ...d,
        proof_image: d.proof_image ? JSON.parse(d.proof_image) : null
      })),
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total: parseInt(totalResult.rows[0].total),
        totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / pageLimit)
      }
    });

  } catch (err) {
    console.error("Get user deposits error:", err);
    res.status(500).json({ message: "Failed to fetch deposit history" });
  }
};

/* --------------------------------------------------
   ✅  Purchase Item (Funds into Escrow)
-------------------------------------------------- */
exports.purchase = async (req, res) => {
  const client = await db.getConnection();
  try {
    const { productId } = req.params;
    const buyerId = req.session.userId;
    
    // Get quantity from body if provided
    const { quantity = 1, shipping_address = '', notes = '' } = req.body;

    console.log('=== PURCHASE REQUEST START ===');
    console.log('Product ID from params:', productId, 'Type:', typeof productId);
    console.log('Buyer ID from session:', buyerId);
    console.log('Request body:', req.body);
    console.log('Session:', req.session);

    if (!buyerId) {
      console.log('No buyerId in session - user not logged in');
      return res.status(401).json({
        success: false,
        message: 'You must be logged in to make a purchase'
      });
    }

    if (!productId) {
      console.log('No productId provided');
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    await client.query('BEGIN');

    // Log the exact SQL query we're about to run
    const productQuery = `SELECT 
      p.id,
      p.seller_id,
      p.price,
      p.name,
      u.name as seller_name
    FROM products p
    LEFT JOIN users u ON p.seller_id = u.id
    WHERE p.id = $1`;
    
    console.log('Executing product query:', productQuery);
    console.log('With parameter:', productId);

    // Get product details
    const productResult = await client.query(productQuery, [productId]);
    
    console.log('Product query result count:', productResult.rows.length);
    console.log('Product query result:', productResult.rows);
    
    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      
      // Let's check if the product exists at all in the database
      const allProducts = await client.query(
        'SELECT id, name FROM products WHERE id = $1',
        [productId]
      );
      
      console.log('Direct product check:', allProducts.rows);
      
      return res.status(404).json({ 
        success: false,
        message: `Product not found with ID: ${productId}`,
        debug: {
          productId: productId,
          existsInDB: allProducts.rows.length > 0 ? 'Yes' : 'No',
          allProducts: allProducts.rows
        }
      });
    }

    const product = productResult.rows[0];
    const sellerId = product.seller_id;
    const amount = parseFloat(product.price) * quantity;

    console.log('Product found:', {
      id: product.id,
      name: product.name,
      seller_id: sellerId,
      price: product.price,
      calculated_amount: amount,
      quantity: quantity
    });

    // Check buyer balance
    const walletResult = await client.query(
      "SELECT balance FROM wallet WHERE user_id = $1",
      [buyerId]
    );
    
    console.log('Wallet check result:', walletResult.rows);
    
    // Check if wallet exists
    if (walletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log('Wallet not found for user:', buyerId);
      return res.status(400).json({ 
        success: false,
        message: "Wallet not found for user. Please contact support.",
        debug: {
          userId: buyerId
        }
      });
    }
    
    const currentBalance = parseFloat(walletResult.rows[0].balance);
    console.log('Wallet balance:', currentBalance);
    console.log('Required amount:', amount);
    
    if (currentBalance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false,
        message: `Insufficient funds. You need ₦${amount} but have ₦${currentBalance}`,
        currentBalance: currentBalance,
        requiredAmount: amount
      });
    }

    // Deduct from buyer
    await client.query(
      "UPDATE wallet SET balance = balance - $1 WHERE user_id = $2",
      [amount, buyerId]
    );

    console.log('Wallet deducted successfully');

    // 1. Create order
    const orderQuery = `INSERT INTO orders 
       (buyer_id, seller_id, product_id, type, quantity, total, 
        shipping_address, payment_method, notes, payment_status)
       VALUES ($1, $2, $3, 'product', $4, $5, $6, 'wallet', $7, 'pending')
       RETURNING id`;
    
    console.log('Creating order with query:', orderQuery);
    console.log('Order parameters:', [buyerId, sellerId, productId, quantity, amount, shipping_address, notes]);

    const orderResult = await client.query(orderQuery, [
      buyerId, 
      sellerId, 
      productId, 
      quantity, 
      amount, 
      shipping_address, 
      notes
    ]);
    
    const orderId = orderResult.rows[0].id;
    console.log('Order created with ID:', orderId);

    // 2. Create transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, product_id)
       VALUES ($1, $2, $3, 'purchase', 'pending', $4)
       RETURNING id`,
      [buyerId, sellerId, amount, productId]
    );
    
    const transactionId = transactionResult.rows[0].id;
    console.log('Transaction created with ID:', transactionId);

    // 3. Create escrow linked to order
    await client.query(
      `INSERT INTO escrow 
       (buyer_id, seller_id, transaction_id, order_id, amount, status, type)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'order')`,
      [buyerId, sellerId, transactionId, orderId, amount]
    );

    console.log('Escrow created successfully');

    await client.query('COMMIT');
    
    console.log('=== PURCHASE COMPLETED SUCCESSFULLY ===');
    
    res.json({ 
      success: true,
      message: "Purchase successful, funds in escrow", 
      orderId: orderId,
      transactionId: transactionId,
      data: {
        id: orderId,
        buyer_id: buyerId,
        seller_id: sellerId,
        product_id: productId,
        product_name: product.name,
        amount: amount,
        quantity: quantity,
        payment_status: 'held_in_escrow',
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('=== PURCHASE ERROR ===');
    console.error('Error details:', err);
    console.error('Error stack:', err.stack);
    console.error('=== END ERROR ===');
    res.status(500).json({ 
      success: false,
      message: "Purchase failed",
      error: err.message
    });
  } finally {
    client.release();
  }
};

// Add this to your walletController.js
exports.bookService = async (req, res) => {
  const client = await db.getConnection();
  try {
    const { serviceId } = req.params;
    const buyerId = req.session.userId;
    
    // Get service booking details from body
    const { 
      quantity = 1, 
      shipping_address = '', 
      notes = '',
      scheduled_date = null,
      scheduled_time = null,
      duration = null,
      agreed_price = null,
      service_type = null,
      location = null
    } = req.body;

    console.log('=== SERVICE BOOKING REQUEST START ===');
    console.log('Service ID from params:', serviceId, 'Type:', typeof serviceId);
    console.log('Buyer ID from session:', buyerId);
    console.log('Request body:', req.body);

    if (!buyerId) {
      console.log('No buyerId in session - user not logged in');
      return res.status(401).json({
        success: false,
        message: 'You must be logged in to book a service'
      });
    }

    if (!serviceId) {
      console.log('No serviceId provided');
      return res.status(400).json({
        success: false,
        message: 'Service ID is required'
      });
    }

    await client.query('BEGIN');

    // Get service details
    const serviceQuery = `SELECT 
      p.id,
      p.seller_id,
      p.price,
      p.name,
      u.name as seller_name
    FROM products p
    LEFT JOIN users u ON p.seller_id = u.id
    WHERE p.id = $1`;
    
    console.log('Executing service query:', serviceQuery);
    console.log('With parameter:', serviceId);

    // Get service details
    const serviceResult = await client.query(serviceQuery, [serviceId]);
    
    console.log('Service query result count:', serviceResult.rows.length);
    console.log('Service query result:', serviceResult.rows);
    
    if (serviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      
      // Let's check if the service exists at all in the database
      const allServices = await client.query(
        'SELECT id, name FROM products WHERE id = $1',
        [serviceId]
      );
      
      console.log('Direct service check:', allServices.rows);
      
      return res.status(404).json({ 
        success: false,
        message: `Service not found with ID: ${serviceId}`,
        debug: {
          serviceId: serviceId,
          existsInDB: allServices.rows.length > 0 ? 'Yes' : 'No',
          allServices: allServices.rows
        }
      });
    }

    const service = serviceResult.rows[0];
    const sellerId = service.seller_id;
    
    // Use agreed_price if provided, otherwise use service price
    const amount = agreed_price ? parseFloat(agreed_price) : (parseFloat(service.price) * quantity);

    console.log('Service found:', {
      id: service.id,
      name: service.name,
      seller_id: sellerId,
      price: service.price,
      agreed_price: agreed_price,
      calculated_amount: amount,
      quantity: quantity
    });

    // Check buyer balance
    const walletResult = await client.query(
      "SELECT balance FROM wallet WHERE user_id = $1",
      [buyerId]
    );
    
    console.log('Wallet check result:', walletResult.rows);
    
    // Check if wallet exists
    if (walletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log('Wallet not found for user:', buyerId);
      return res.status(400).json({ 
        success: false,
        message: "Wallet not found for user. Please contact support.",
        debug: {
          userId: buyerId
        }
      });
    }
    
    const currentBalance = parseFloat(walletResult.rows[0].balance);
    console.log('Wallet balance:', currentBalance);
    console.log('Required amount:', amount);
    
    if (currentBalance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false,
        message: `Insufficient funds. You need ₦${amount} but have ₦${currentBalance}`,
        currentBalance: currentBalance,
        requiredAmount: amount
      });
    }

    // Deduct from buyer
    await client.query(
      "UPDATE wallet SET balance = balance - $1 WHERE user_id = $2",
      [amount, buyerId]
    );

    console.log('Wallet deducted successfully');

    // 1. Create order for service
    const orderQuery = `INSERT INTO orders 
       (buyer_id, seller_id, product_id, type, quantity, total, 
        shipping_address, payment_method, notes, payment_status)
       VALUES ($1, $2, $3, 'service', $4, $5, $6, 'wallet', $7, 'pending')
       RETURNING id`;
    
    console.log('Creating service order with query:', orderQuery);
    console.log('Order parameters:', [buyerId, sellerId, serviceId, quantity, amount, shipping_address, notes]);

    const orderResult = await client.query(orderQuery, [
      buyerId, 
      sellerId, 
      serviceId, 
      quantity, 
      amount, 
      shipping_address, 
      notes
    ]);
    
    const orderId = orderResult.rows[0].id;
    console.log('Service order created with ID:', orderId);

    // 2. Create transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, product_id)
       VALUES ($1, $2, $3, 'purchase', 'pending', $4)
       RETURNING id`,
      [buyerId, sellerId, amount, serviceId]
    );
    
    const transactionId = transactionResult.rows[0].id;
    console.log('Transaction created with ID:', transactionId);

    // 3. Create escrow linked to order
    await client.query(
      `INSERT INTO escrow 
       (buyer_id, seller_id, transaction_id, order_id, amount, status, type)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'order')`,
      [buyerId, sellerId, transactionId, orderId, amount]
    );

    console.log('Escrow created successfully');

    await client.query('COMMIT');
    
    console.log('=== SERVICE BOOKING COMPLETED SUCCESSFULLY ===');
    
    res.json({ 
      success: true,
      message: "Service booked successfully, funds in escrow", 
      orderId: orderId,
      transactionId: transactionId,
      data: {
        id: orderId,
        buyer_id: buyerId,
        seller_id: sellerId,
        service_id: serviceId,
        service_name: service.name,
        amount: amount,
        quantity: quantity,
        payment_status: 'held_in_escrow',
        scheduled_date: scheduled_date,
        scheduled_time: scheduled_time,
        duration: duration,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('=== SERVICE BOOKING ERROR ===');
    console.error('Error details:', err);
    console.error('Error stack:', err.stack);
    console.error('=== END ERROR ===');
    res.status(500).json({ 
      success: false,
      message: "Service booking failed",
      error: err.message
    });
  } finally {
    client.release();
  }
};

/* --------------------------------------------------
   ✅  Confirm Received (Release to Seller)
-------------------------------------------------- */
exports.confirmReceived = async (req, res) => {
  const client = await db.getConnection();
  try {
    if (!req.session.userId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const { orderId } = req.body;
    const buyerId = req.session.userId;

    console.log('Confirm received request:', { orderId, buyerId });

    await client.query('BEGIN');

    // Get escrow record using orderId
    const escrowResult = await client.query(
      "SELECT * FROM escrow WHERE order_id=$1 AND buyer_id=$2 AND status='pending'",
      [orderId, buyerId]
    );
    
    if (escrowResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log('Escrow not found for order:', orderId, 'buyer:', buyerId);
      return res.status(404).json({ 
        success: false,
        message: "Escrow not found or already released" 
      });
    }
    
    const escrow = escrowResult.rows[0];
    console.log('Found escrow:', escrow);

    // 1. Release funds to seller
    await client.query(
      "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
      [parseFloat(escrow.amount), escrow.seller_id]
    );
    
    console.log('Funds released to seller:', escrow.seller_id, 'Amount:', escrow.amount);

    // 2. Update escrow status
    await client.query(
      "UPDATE escrow SET status='released', released_at=NOW() WHERE id=$1",
      [escrow.id]
    );
    
    // 3. Update transaction status
    await client.query(
      "UPDATE transactions SET status='completed' WHERE id=$1",
      [escrow.transaction_id]
    );
    
    // 4. Update order payment status
    await client.query(
      "UPDATE orders SET payment_status='paid' WHERE id=$1",
      [orderId]
    );

    await client.query('COMMIT');
    
    console.log('Funds released successfully for order:', orderId);
    
    res.json({ 
      success: true,
      message: "Funds released to seller successfully",
      data: {
        orderId: orderId,
        escrowId: escrow.id,
        amount: parseFloat(escrow.amount),
        sellerId: escrow.seller_id
      }
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Confirm Received Error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to release funds",
      error: err.message 
    });
  } finally {
    client.release();
  }
};

/* --------------------------------------------------
   ✅  Raise a Dispute
-------------------------------------------------- */
exports.raiseDispute = async (req, res) => {
  const client = await db.getConnection();
  
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Accept orderId instead of escrowId
    const { orderId, disputeType, title, description, evidenceUrls } = req.body;
    const userId = req.session.userId;

    await client.query('BEGIN');

    // 1. Find escrow by order_id
    const escrowResult = await client.query(
      `SELECT e.*, o.buyer_id, o.seller_id, o.delivery_company_id
       FROM escrow e
       JOIN orders o ON e.order_id = o.id
       WHERE e.order_id = $1 AND (o.buyer_id = $2 OR o.seller_id = $2)`,
      [orderId, userId]
    );
    
    if (escrowResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        message: "Escrow not found for this order or you don't have permission" 
      });
    }

    const escrow = escrowResult.rows[0];
    const escrowId = escrow.id;
    
    // 2. Determine who is raising the dispute and who is being disputed
    let raisedByRole, disputedUserId;
    
    if (userId === escrow.buyer_id) {
      raisedByRole = 'buyer';
      disputedUserId = escrow.seller_id;
    } else if (userId === escrow.seller_id) {
      raisedByRole = 'seller';
      disputedUserId = escrow.buyer_id;
    } else if (escrow.delivery_company_id && userId === escrow.delivery_company_id) {
      raisedByRole = 'delivery_agent';
      disputedUserId = escrow.buyer_id;
    } else {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        success: false,
        message: "You are not part of this transaction" 
      });
    }

    // 3. Update escrow status
    await client.query(
      "UPDATE escrow SET status = 'disputed' WHERE id = $1",
      [escrowId]
    );

    // 4. Create dispute record
    const disputeResult = await client.query(
      `INSERT INTO disputes (
        order_id, escrow_id, raised_by_id, disputed_user_id, raised_by_role,
        dispute_type, title, description, evidence_urls, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING id`,
      [
        orderId,
        escrowId,
        userId,
        disputedUserId,
        raisedByRole,
        disputeType || 'other',
        title || `Dispute for Order #${orderId}`,
        description || 'No description provided',
        evidenceUrls ? JSON.stringify(evidenceUrls) : null
      ]
    );

    const disputeId = disputeResult.rows[0].id;

    // 5. Update order status if needed
    await client.query(
      "UPDATE orders SET dispute_status = 'open', updated_at = NOW() WHERE id = $1",
      [orderId]
    );

    await client.query('COMMIT');

    res.json({ 
      success: true,
      message: "Dispute raised successfully. Admin will review your case.",
      disputeId: disputeId
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Raise Dispute Error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to raise dispute", 
      error: err.message 
    });
  } finally {
    client.release();
  }
};

/* --------------------------------------------------
   ✅  Admin Resolve Dispute
-------------------------------------------------- */
exports.resolveDispute = async (req, res) => {
  const client = await db.getConnection();
  try {
    const { escrowId, action } = req.body; // action = "release" or "refund"

    await client.query('BEGIN');

    const escrowResult = await client.query("SELECT * FROM escrow WHERE id=$1", [escrowId]);
    if (escrowResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Escrow not found" });
    }
    const escrow = escrowResult.rows[0];

    if (action === "release") {
      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [parseFloat(escrow.amount), escrow.seller_id]
      );
      await client.query(
        "UPDATE transactions SET status='completed' WHERE id=$1",
        [escrow.transaction_id]
      );
    } else if (action === "refund") {
      await client.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [parseFloat(escrow.amount), escrow.buyer_id]
      );
      await client.query(
        "UPDATE transactions SET status='refunded' WHERE id=$1",
        [escrow.transaction_id]
      );
    }

    await client.query(
      "UPDATE escrow SET status=$1 WHERE id=$2",
      [action === "release" ? "released" : "refunded", escrowId]
    );

    await client.query('COMMIT');
    res.json({ message: `Escrow ${action}d successfully` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Resolve Dispute Error:", err);
    res.status(500).json({ message: "Dispute resolution failed" });
  } finally {
    client.release();
  }
};

exports.addBankAccount = async (req, res) => {
  try {
    // auth check
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.session.userId;
    const { account_number, bank_code } = req.body;

    if (!account_number || !bank_code) {
      return res.status(400).json({ message: "account_number and bank_code are required" });
    }

    // First, get the bank name from our banks list
    let bankName = null;
    try {
      const bankResponse = await axios.get('https://api.paystack.co/bank', {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        },
      });

      if (bankResponse.data.status) {
        const bank = bankResponse.data.data.find(b => b.code === bank_code.toString());
        bankName = bank ? bank.name : null;
      }
    } catch (err) {
      console.error("Error fetching bank name:", err);
      // Continue without bank name
    }

    // Verify account with Paystack
    let paystackResp;
    try {
      paystackResp = await axios.get("https://api.paystack.co/bank/resolve", {
        params: { account_number: account_number.toString(), bank_code: bank_code.toString() },
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      });
    } catch (err) {
      const pd = err.response?.data;
      console.error("Paystack resolve error:", pd || err.message);
      return res.status(400).json({
        message: "Failed to verify account with Paystack",
        details: pd?.message || err.message,
      });
    }

    if (!paystackResp.data || paystackResp.data.status !== true) {
      return res.status(400).json({ message: "Paystack verification failed", details: paystackResp.data });
    }

    const resolved = paystackResp.data.data;
    const accountName = resolved.account_name || resolved.accountName || "";
    const resolvedAccountNumber = resolved.account_number || resolved.accountNumber || account_number;

    // Check if this user already saved this exact account
    const existing = await db.query(
      "SELECT id, account_name, bank_name FROM bank_accounts WHERE user_id = $1 AND bank_code = $2 AND account_number = $3",
      [userId, bank_code, resolvedAccountNumber]
    );
    if (existing.rows.length > 0) {
      return res.status(200).json({
        message: "This bank account is already added",
        account: existing.rows[0]
      });
    }

    // Insert into DB - use the bank name we looked up
    const insertResult = await db.query(
      "INSERT INTO bank_accounts (user_id, bank_name, bank_code, account_number, account_name, is_default) VALUES ($1, $2, $3, $4, $5, 0) RETURNING id",
      [userId, bankName, bank_code, resolvedAccountNumber, accountName]
    );

    const newAccountId = insertResult.rows[0].id;

    // Fetch and return the saved record
    const savedRows = await db.query("SELECT id, bank_name, bank_code, account_number, account_name, is_default, created_at FROM bank_accounts WHERE id = $1", [newAccountId]);

    return res.status(201).json({
      message: "Bank account verified and saved",
      account: savedRows.rows[0]
    });
  } catch (err) {
    console.error("addBankAccount Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};