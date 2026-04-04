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

    const [rows] = await db.execute(
      "SELECT * FROM wallet WHERE user_id = ?",
      [req.session.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    res.json({ balance: rows[0].balance });
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
  const connection = await db.getConnection();
  
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

    await connection.beginTransaction();
    console.log('🔒 Transaction started');

    // Generate unique invoice number
    let invoiceNumber = generateInvoiceNumber();
    console.log('📄 Generated invoice:', invoiceNumber);
    
    // Check for duplicate invoice (unlikely but safe)
    const [existingInvoice] = await connection.execute(
      "SELECT id FROM deposits WHERE invoice_number = ?",
      [invoiceNumber]
    );
    
    if (existingInvoice.length > 0) {
      // Regenerate if duplicate
      invoiceNumber = generateInvoiceNumber();
      console.log('🔄 Regenerated invoice:', invoiceNumber);
    }

    // Create deposit request
    console.log('💾 Creating deposit record...');
    const [result] = await connection.execute(
      `INSERT INTO deposits 
       (user_id, invoice_number, amount, status) 
       VALUES (?, ?, ?, 'pending')`,
      [userId, invoiceNumber, amountNum]
    );

    const depositId = result.insertId;
    console.log('✅ Deposit created with ID:', depositId);

    // Get SYSTEM_USER_ID (usually 0 for system transactions)
    const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID || 0;

    // Log transaction
    /*await connection.execute(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, deposit_id) 
       VALUES (?, ?, ?, 'deposit', 'pending', ?)`,
      [userId, SYSTEM_USER_ID, amountNum, depositId]
    );
    console.log('📝 Transaction logged');
*/
    // Get deposit account details from environment variables or use defaults
    const depositAccount = {
      bank_name: process.env.DEPOSIT_BANK_NAME || "Moniepoint mfb",
      account_number: process.env.DEPOSIT_ACCOUNT_NUMBER || "9036361445",
      account_name: process.env.DEPOSIT_ACCOUNT_NAME || "Errandly Enterprises",
    };

    await connection.commit();
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
    
    if (connection) {
      try {
        await connection.rollback();
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
    if (connection) {
      try {
        connection.release();
        console.log('🔓 Connection released');
      } catch (releaseErr) {
        console.error('❌ Connection release error:', releaseErr);
      }
    }
  }
};

exports.requestWithdrawal = async (req, res) => {
  const connection = await db.getConnection();
  
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

    await connection.beginTransaction();

    // Check wallet balance
    const [walletRows] = await connection.execute(
      "SELECT balance FROM wallet WHERE user_id = ?",
      [userId]
    );
    
    if (walletRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Wallet not found" 
      });
    }
    
    const wallet = walletRows[0];
    
    // Check if user has sufficient balance
    if (wallet.balance < amountNum) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false,
        message: `Insufficient funds. Available: ₦${wallet.balance.toLocaleString()}` 
      });
    }

    // Create withdrawal request
    const [result] = await connection.execute(
      `INSERT INTO withdrawals 
       (user_id, amount, bank_name, bank_code, account_number, account_name) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        amountNum, 
        bank_name, 
        bank_code || '', 
        account_number, 
        account_name
      ]
    );

    const withdrawalId = result.insertId;

    // Deduct amount from wallet
    await connection.execute(
      "UPDATE wallet SET balance = balance - ? WHERE user_id = ?",
      [amountNum, userId]
    );

    // Create transaction record
   /* try {
      await connection.execute(
        `INSERT INTO transactions 
         (user_id, amount, type, status, withdrawal_id, description) 
         VALUES (?, ?, 'withdrawal', 'pending', ?, ?)`,
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
    }
*/
    await connection.commit();

    // Get updated balance
    const [updatedWallet] = await connection.execute(
      "SELECT balance FROM wallet WHERE user_id = ?",
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
        previous_balance: wallet.balance,
        new_balance: updatedWallet[0].balance,
        created_at: new Date().toISOString()
      }
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Request withdrawal error details:", {
      message: err.message,
      sql: err.sql,
      code: err.code,
      errno: err.errno
    });
    res.status(500).json({ 
      success: false,
      message: "Failed to create withdrawal request",
      error: err.message
    });
  } finally {
    if (connection) connection.release();
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

    let query = `
      SELECT d.*, u.name as user_name, u.email, 
             admin.name as approved_by_name
      FROM deposits d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN users admin ON d.approved_by = admin.id
      WHERE d.user_id = ?
    `;
    
    const params = [userId];
    
    if (status && ['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      query += " AND d.status = ?";
      params.push(status);
    }
    
    query += " ORDER BY d.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [deposits] = await db.execute(query, params);

    const [totalResult] = await db.execute(
      `SELECT COUNT(*) as total 
       FROM deposits 
       WHERE user_id = ? ${status ? 'AND status = ?' : ''}`,
      status ? [userId, status] : [userId]
    );

    res.json({
      success: true,
      deposits: deposits.map(d => ({
        ...d,
        proof_image: d.proof_image ? JSON.parse(d.proof_image) : null
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult[0].total,
        totalPages: Math.ceil(totalResult[0].total / limit)
      }
    });

  } catch (err) {
    console.error("Get user deposits error:", err);
    res.status(500).json({ message: "Failed to fetch deposit history" });
  }
};


/* --------------------------------------------------
   ✅  Fund Wallet (Initialize Paystack)
-------------------------------------------------- */
/*exports.fundWallet = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { amount, email } = req.body;
    if (!amount || !email) {
      return res.status(400).json({ message: "Amount and email required" });
    }

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: amount * 100, // Paystack uses kobo
        // Remove callback_url for WebView approach
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (err) {
    console.error("Fund Wallet Error:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment initialization failed" });
  }
};

/* --------------------------------------------------
   ✅  Paystack Webhook (Verify Payment)
-------------------------------------------------- */
/* --------------------------------------------------
   ✅  Paystack Webhook (Verify Payment) - UPDATED
-------------------------------------------------- */
/* exports.verifyPayment = async (req, res) => {
  let connection;
  
  try {
    // Verify webhook signature
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("Invalid webhook signature");
      return res.status(400).json({ message: "Invalid signature" });
    }

    const event = req.body;
    console.log("Webhook received:", event.event);

    if (event.event === "charge.success") {
      const paymentData = event.data;
      const amount = paymentData.amount / 100;
      const email = paymentData.customer.email;
      const reference = paymentData.reference;

      console.log(`Processing payment: ${reference}, Amount: ${amount}, Email: ${email}`);

      // Find user
      const [user] = await db.execute("SELECT id FROM users WHERE email = ?", [email]);
      if (user.length === 0) {
        console.error(`User not found for email: ${email}`);
        return res.status(404).json({ message: "User not found" });
      }

      const userId = user[0].id;
      connection = await db.getConnection();

      await connection.beginTransaction();

      // Check if already processed
      const [existingTx] = await connection.execute(
        "SELECT id FROM transactions WHERE reference = ? AND status = 'completed'",
        [reference]
      );

      if (existingTx.length > 0) {
        console.log(`Payment ${reference} already processed`);
        await connection.rollback();
        return res.sendStatus(200);
      }

      // Check if wallet exists, create if not
      const [walletCheck] = await connection.execute(
        "SELECT id FROM wallet WHERE user_id = ?",
        [userId]
      );

      if (walletCheck.length === 0) {
        await connection.execute(
          "INSERT INTO wallet (user_id, balance) VALUES (?, ?)",
          [userId, amount]
        );
      } else {
        // Credit existing wallet
        await connection.execute(
          "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
          [amount, userId]
        );
      }

      // Log transaction
      await connection.execute(
        `INSERT INTO transactions 
         (sender_id, receiver_id, amount, type, status, reference) 
         VALUES (?, ?, ?, 'funding', 'completed', ?)`,
        [userId, userId, amount, reference]
      );

      await connection.commit();
      console.log(`Successfully processed payment ${reference} for user ${userId}`);
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Verify Payment Webhook Error:", err.message);
    
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    
    res.sendStatus(500);
  }
};
*/
/* --------------------------------------------------
   ✅  Verify Payment (For Frontend)
-------------------------------------------------- */
/*exports.verifyPaymentFrontend = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { reference } = req.query || req.body;
    
    if (!reference) {
      return res.status(400).json({ message: "Payment reference required" });
    }

    // Verify with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
        },
      }
    );

    if (!response.data.status || response.data.data.status !== "success") {
      return res.status(400).json({ 
        message: "Payment verification failed",
        data: response.data 
      });
    }

    const paymentData = response.data.data;
    const amount = paymentData.amount / 100;
    const email = paymentData.customer.email;

    // Find user
    const [user] = await db.execute("SELECT id FROM users WHERE email = ?", [email]);
    if (user.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userId = user[0].id;
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Check if transaction already processed
      const [existingTx] = await connection.execute(
        "SELECT id FROM transactions WHERE reference = ? AND status = 'completed'",
        [reference]
      );

      if (existingTx.length > 0) {
        await connection.rollback();
        return res.json({ 
          message: "Payment already processed",
          success: true 
        });
      }

      // ✅ Credit wallet
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [amount, userId]
      );

      // ✅ Log transaction
      await connection.execute(
        `INSERT INTO transactions 
        (sender_id, receiver_id, amount, type, status, reference) 
        VALUES (?, ?, ?, 'funding', 'completed', ?)`,
      [userId, userId, amount, reference] // sender_id = receiver_id = userId
      );

      await connection.commit();

      // Get updated balance
      const [walletRows] = await connection.execute(
        "SELECT balance FROM wallet WHERE user_id = ?",
        [userId]
      );

      res.json({
        success: true,
        message: "Wallet funded successfully",
        amount,
        newBalance: walletRows[0].balance,
      });

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error("Verify Payment Frontend Error:", err.response?.data || err.message);
    res.status(500).json({ 
      message: "Payment verification failed",
      error: err.message 
    });
  }
};
*/
/* --------------------------------------------------
   ✅  Purchase Item (Funds into Escrow)
-------------------------------------------------- */
// ✅ Purchase Item (money goes into escrow)
// In walletController.js - Update the purchase function
exports.purchase = async (req, res) => {
  const connection = await db.getConnection();
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

    await connection.beginTransaction();

    // Log the exact SQL query we're about to run
    const productQuery = `SELECT 
      p.id,
      p.seller_id,
      p.price,
      p.name,
      u.name as seller_name
    FROM products p
    LEFT JOIN users u ON p.seller_id = u.id
    WHERE p.id = ?`;
    
    console.log('Executing product query:', productQuery);
    console.log('With parameter:', productId);

    // Get product details
    const [productRows] = await connection.execute(productQuery, [productId]);
    
    console.log('Product query result count:', productRows.length);
    console.log('Product query result:', productRows);
    
    if (productRows.length === 0) {
      await connection.rollback();
      
      // Let's check if the product exists at all in the database
      const [allProducts] = await connection.execute(
        'SELECT id, name FROM products WHERE id = ?',
        [productId]
      );
      
      console.log('Direct product check:', allProducts);
      
      return res.status(404).json({ 
        success: false,
        message: `Product not found with ID: ${productId}`,
        debug: {
          productId: productId,
          existsInDB: allProducts.length > 0 ? 'Yes' : 'No',
          allProducts: allProducts
        }
      });
    }

    const product = productRows[0];
    const sellerId = product.seller_id;
    const amount = product.price * quantity;

    console.log('Product found:', {
      id: product.id,
      name: product.name,
      seller_id: sellerId,
      price: product.price,
      calculated_amount: amount,
      quantity: quantity
    });

    // Check buyer balance
    const [walletRows] = await connection.execute(
      "SELECT balance FROM wallet WHERE user_id = ?",
      [buyerId]
    );
    
    console.log('Wallet check result:', walletRows);
    
    // Check if wallet exists
    if (walletRows.length === 0) {
      await connection.rollback();
      console.log('Wallet not found for user:', buyerId);
      return res.status(400).json({ 
        success: false,
        message: "Wallet not found for user. Please contact support.",
        debug: {
          userId: buyerId
        }
      });
    }
    
    console.log('Wallet balance:', walletRows[0].balance);
    console.log('Required amount:', amount);
    
    if (walletRows[0].balance < amount) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false,
        message: `Insufficient funds. You need ₦${amount} but have ₦${walletRows[0].balance}`,
        currentBalance: walletRows[0].balance,
        requiredAmount: amount
      });
    }

    // Deduct from buyer
    await connection.execute(
      "UPDATE wallet SET balance = balance - ? WHERE user_id = ?",
      [amount, buyerId]
    );

    console.log('Wallet deducted successfully');

    // 1. Create order
    const orderQuery = `INSERT INTO orders 
       (buyer_id, seller_id, product_id, type, quantity, total, 
        shipping_address, payment_method, notes, payment_status)
       VALUES (?, ?, ?, 'product', ?, ?, ?, 'wallet', ?, 'pending')`;
    
    console.log('Creating order with query:', orderQuery);
    console.log('Order parameters:', [buyerId, sellerId, productId, quantity, amount, shipping_address, notes]);

    const [orderResult] = await connection.execute(orderQuery, [
      buyerId, 
      sellerId, 
      productId, 
      quantity, 
      amount, 
      shipping_address, 
      notes
    ]);
    
    const orderId = orderResult.insertId;
    console.log('Order created with ID:', orderId);

    // 2. Create transaction
    const [transactionResult] = await connection.execute(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, product_id)
       VALUES (?, ?, ?, 'purchase', 'pending', ? )`,
      [buyerId, sellerId, amount, productId]
    );
    
    const transactionId = transactionResult.insertId;
    console.log('Transaction created with ID:', transactionId);

    // 3. Create escrow linked to order
    await connection.execute(
      `INSERT INTO escrow 
       (buyer_id, seller_id, transaction_id, order_id, amount, status, type)
       VALUES (?, ?, ?, ?, ?, 'pending', 'order')`,
      [buyerId, sellerId, transactionId, orderId, amount]
    );

    console.log('Escrow created successfully');

    await connection.commit();
    
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
    await connection.rollback();
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
    connection.release();
  }
};

// Add this to your walletController.js
exports.bookService = async (req, res) => {
  const connection = await db.getConnection();
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

    await connection.beginTransaction();

    // Get service details
    const serviceQuery = `SELECT 
      p.id,
      p.seller_id,
      p.price,
      p.name,
      u.name as seller_name
    FROM products p
    LEFT JOIN users u ON p.seller_id = u.id
    WHERE p.id = ?`;
    
    console.log('Executing service query:', serviceQuery);
    console.log('With parameter:', serviceId);

    // Get service details
    const [serviceRows] = await connection.execute(serviceQuery, [serviceId]);
    
    console.log('Service query result count:', serviceRows.length);
    console.log('Service query result:', serviceRows);
    
    if (serviceRows.length === 0) {
      await connection.rollback();
      
      // Let's check if the service exists at all in the database
      const [allServices] = await connection.execute(
        'SELECT id, name FROM products WHERE id = ?',
        [serviceId]
      );
      
      console.log('Direct service check:', allServices);
      
      return res.status(404).json({ 
        success: false,
        message: `Service not found with ID: ${serviceId}`,
        debug: {
          serviceId: serviceId,
          existsInDB: allServices.length > 0 ? 'Yes' : 'No',
          allServices: allServices
        }
      });
    }

    const service = serviceRows[0];
    const sellerId = service.seller_id;
    
    // Use agreed_price if provided, otherwise use service price
    const amount = agreed_price ? parseFloat(agreed_price) : (service.price * quantity);

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
    const [walletRows] = await connection.execute(
      "SELECT balance FROM wallet WHERE user_id = ?",
      [buyerId]
    );
    
    console.log('Wallet check result:', walletRows);
    
    // Check if wallet exists
    if (walletRows.length === 0) {
      await connection.rollback();
      console.log('Wallet not found for user:', buyerId);
      return res.status(400).json({ 
        success: false,
        message: "Wallet not found for user. Please contact support.",
        debug: {
          userId: buyerId
        }
      });
    }
    
    console.log('Wallet balance:', walletRows[0].balance);
    console.log('Required amount:', amount);
    
    if (walletRows[0].balance < amount) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false,
        message: `Insufficient funds. You need ₦${amount} but have ₦${walletRows[0].balance}`,
        currentBalance: walletRows[0].balance,
        requiredAmount: amount
      });
    }

    // Deduct from buyer
    await connection.execute(
      "UPDATE wallet SET balance = balance - ? WHERE user_id = ?",
      [amount, buyerId]
    );

    console.log('Wallet deducted successfully');

    // 1. Create order for service
    const orderQuery = `INSERT INTO orders 
       (buyer_id, seller_id, product_id, type, quantity, total, 
        shipping_address, payment_method, notes, payment_status)
       VALUES (?, ?, ?, 'service', ?, ?, ?, 'wallet', ?, 'pending')`;
    
    console.log('Creating service order with query:', orderQuery);
    console.log('Order parameters:', [buyerId, sellerId, serviceId, quantity, amount, shipping_address, notes]);

    const [orderResult] = await connection.execute(orderQuery, [
      buyerId, 
      sellerId, 
      serviceId, 
      quantity, 
      amount, 
      shipping_address, 
      notes
    ]);
    
    const orderId = orderResult.insertId;
    console.log('Service order created with ID:', orderId);

    // 2. Create transaction
    const [transactionResult] = await connection.execute(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, product_id)
       VALUES (?, ?, ?, 'purchase', 'pending', ? )`,
      [buyerId, sellerId, amount, serviceId]
    );
    
    const transactionId = transactionResult.insertId;
    console.log('Transaction created with ID:', transactionId);

    // 3. Create escrow linked to order
    await connection.execute(
      `INSERT INTO escrow 
       (buyer_id, seller_id, transaction_id, order_id, amount, status, type)
       VALUES (?, ?, ?, ?, ?, 'pending', 'order')`,
      [buyerId, sellerId, transactionId, orderId, amount]
    );

    console.log('Escrow created successfully');

    await connection.commit();
    
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
    await connection.rollback();
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
    connection.release();
  }
};


/* --------------------------------------------------
   ✅  Confirm Received (Release to Seller)
-------------------------------------------------- */
/* --------------------------------------------------
   ✅  Confirm Received (Release to Seller)
-------------------------------------------------- */
exports.confirmReceived = async (req, res) => {
  const connection = await db.getConnection();
  try {
    if (!req.session.userId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const { orderId } = req.body; // Change to accept orderId
    const buyerId = req.session.userId;

    console.log('Confirm received request:', { orderId, buyerId });

    await connection.beginTransaction();

    // Get escrow record using orderId
    const [escrowRows] = await connection.execute(
      "SELECT * FROM escrow WHERE order_id=? AND buyer_id=? AND status='pending'",
      [orderId, buyerId]
    );
    
    if (escrowRows.length === 0) {
      await connection.rollback();
      console.log('Escrow not found for order:', orderId, 'buyer:', buyerId);
      return res.status(404).json({ 
        success: false,
        message: "Escrow not found or already released" 
      });
    }
    
    const escrow = escrowRows[0];
    console.log('Found escrow:', escrow);

    // 1. Release funds to seller
    await connection.execute(
      "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
      [escrow.amount, escrow.seller_id]
    );
    
    console.log('Funds released to seller:', escrow.seller_id, 'Amount:', escrow.amount);

    // 2. Update escrow status
    await connection.execute(
      "UPDATE escrow SET status='released', released_at=NOW() WHERE id=?",
      [escrow.id]
    );
    
    // 3. Update transaction status
    await connection.execute(
      "UPDATE transactions SET status='completed' WHERE id=?",
      [escrow.transaction_id]
    );
    
    // 4. Update order payment status
    await connection.execute(
      "UPDATE orders SET payment_status='paid' WHERE id=?",
      [orderId]
    );

    await connection.commit();
    
    console.log('Funds released successfully for order:', orderId);
    
    res.json({ 
      success: true,
      message: "Funds released to seller successfully",
      data: {
        orderId: orderId,
        escrowId: escrow.id,
        amount: escrow.amount,
        sellerId: escrow.seller_id
      }
    });
    
  } catch (err) {
    await connection.rollback();
    console.error("Confirm Received Error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to release funds",
      error: err.message 
    });
  } finally {
    connection.release();
  }
};


  // ✅  Raise a Dispute

// In walletController.js - Update raiseDispute function
/*exports.raiseDispute = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Accept orderId instead of escrowId
    const { orderId, disputeType, title, description, evidenceUrls } = req.body;
    const userId = req.session.userId;

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // 1. Find escrow by order_id
      const [escrowRows] = await connection.execute(
        `SELECT e.*, o.buyer_id, o.seller_id, o.delivery_company_id
         FROM escrow e
         JOIN orders o ON e.order_id = o.id
         WHERE e.order_id = ? AND (o.buyer_id = ? OR o.seller_id = ?)`,
        [orderId, userId, userId]
      );
      
      if (escrowRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          message: "Escrow not found for this order or you don't have permission" 
        });
      }

      const escrow = escrowRows[0];
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
        disputedUserId = escrow.buyer_id; // or seller depending on context
      } else {
        await connection.rollback();
        return res.status(403).json({ message: "You are not part of this transaction" });
      }

      // 3. Update escrow status
      await connection.execute(
        "UPDATE escrow SET status = 'disputed' WHERE id = ?",
        [escrowId]
      );

      // 4. Create dispute record
      await connection.execute(
        `INSERT INTO disputes (
          order_id, escrow_id, raised_by_id, disputed_user_id, raised_by_role,
          dispute_type, title, description, evidence_urls, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          orderId || escrow.order_id,
          escrowId,
          userId,
          disputedUserId,
          raisedByRole,
          disputeType || 'other',
          title || `Dispute for Order #${orderId || escrow.order_id}`,
          description || 'No description provided',
          evidenceUrls ? JSON.stringify(evidenceUrls) : null
        ]
      );

      // 5. Update order status if needed
      await connection.execute(
        "UPDATE orders SET dispute_status = 'open', updated_at = NOW() WHERE id = ?",
        [orderId || escrow.order_id]
      );

      await connection.commit();

      res.json({ 
        message: "Dispute raised successfully. Admin will review your case.",
        disputeId: result.insertId
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("Raise Dispute Error:", err);
    res.status(500).json({ message: "Failed to raise dispute", error: err.message });
  }
};
*/
/* --------------------------------------------------
   ✅  Resolve Account Name
-------------------------------------------------- */
exports.raiseDispute = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Accept orderId instead of escrowId
    const { orderId, disputeType, title, description, evidenceUrls } = req.body;
    const userId = req.session.userId;

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // 1. Find escrow by order_id
      const [escrowRows] = await connection.execute(
        `SELECT e.*, o.buyer_id, o.seller_id, o.delivery_company_id
         FROM escrow e
         JOIN orders o ON e.order_id = o.id
         WHERE e.order_id = ? AND (o.buyer_id = ? OR o.seller_id = ?)`,
        [orderId, userId, userId]
      );
      
      if (escrowRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          success: false,
          message: "Escrow not found for this order or you don't have permission" 
        });
      }

      const escrow = escrowRows[0];
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
        disputedUserId = escrow.buyer_id; // or seller depending on context
      } else {
        await connection.rollback();
        return res.status(403).json({ 
          success: false,
          message: "You are not part of this transaction" 
        });
      }

      // 3. Update escrow status
      await connection.execute(
        "UPDATE escrow SET status = 'disputed' WHERE id = ?",
        [escrowId]
      );

      // 4. Create dispute record - FIXED: Added result variable
      const [disputeResult] = await connection.execute(
        `INSERT INTO disputes (
          order_id, escrow_id, raised_by_id, disputed_user_id, raised_by_role,
          dispute_type, title, description, evidence_urls, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
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

      const disputeId = disputeResult.insertId; // Get the inserted ID

      // 5. Update order status if needed
      await connection.execute(
        "UPDATE orders SET dispute_status = 'open', updated_at = NOW() WHERE id = ?",
        [orderId]
      );

      await connection.commit();

      res.json({ 
        success: true,
        message: "Dispute raised successfully. Admin will review your case.",
        disputeId: disputeId
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("Raise Dispute Error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to raise dispute", 
      error: err.message 
    });
  }
};

/* --------------------------------------------------
   ✅  Admin Resolve Dispute
-------------------------------------------------- */
exports.resolveDispute = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { escrowId, action } = req.body; // action = "release" or "refund"

    await connection.beginTransaction();

    const [rows] = await connection.execute("SELECT * FROM escrow WHERE id=?", [escrowId]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Escrow not found" });
    }
    const escrow = rows[0];

    if (action === "release") {
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [escrow.amount, escrow.seller_id]
      );
      await connection.execute(
        "UPDATE transactions SET status='completed' WHERE id=?",
        [escrow.transaction_id]
      );
    } else if (action === "refund") {
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [escrow.amount, escrow.buyer_id]
      );
      await connection.execute(
        "UPDATE transactions SET status='refunded' WHERE id=?",
        [escrow.transaction_id]
      );
    }

    await connection.execute(
      "UPDATE escrow SET status=? WHERE id=?",
      [action === "release" ? "released" : "refunded", escrowId]
    );

    await connection.commit();
    res.json({ message: `Escrow ${action}d successfully` });
  } catch (err) {
    await connection.rollback();
    console.error("Resolve Dispute Error:", err);
    res.status(500).json({ message: "Dispute resolution failed" });
  } finally {
    connection.release();
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
    const [existing] = await db.execute(
      "SELECT id, account_name, bank_name FROM bank_accounts WHERE user_id = ? AND bank_code = ? AND account_number = ?",
      [userId, bank_code, resolvedAccountNumber]
    );
    if (existing.length > 0) {
      return res.status(200).json({
        message: "This bank account is already added",
        account: existing[0]
      });
    }

    // Insert into DB - use the bank name we looked up
    const [insertResult] = await db.execute(
      "INSERT INTO bank_accounts (user_id, bank_name, bank_code, account_number, account_name, is_default) VALUES (?, ?, ?, ?, ?, 0)",
      [userId, bankName, bank_code, resolvedAccountNumber, accountName]
    );

    const newAccountId = insertResult.insertId;

    // Fetch and return the saved record
    const [savedRows] = await db.execute("SELECT id, bank_name, bank_code, account_number, account_name, is_default, created_at FROM bank_accounts WHERE id = ?", [newAccountId]);

    return res.status(201).json({
      message: "Bank account verified and saved",
      account: savedRows[0]
    });
  } catch (err) {
    console.error("addBankAccount Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


/* --------------------------------------------------
   ✅  Withdraw Funds (FIXED VERSION)
-------------------------------------------------- */
/*exports.withdrawFunds = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.session.userId;
    const { bank_account_id, amount } = req.body;

    if (!bank_account_id || !amount) {
      return res.status(400).json({ 
        success: false,
        message: "Bank account and amount are required" 
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid amount" 
      });
    }

    // Minimum and maximum amount validation
    const MIN_WITHDRAWAL = 100; // ₦100 minimum
    const MAX_WITHDRAWAL = 5000000; // ₦5 million maximum
    
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

    await connection.beginTransaction();

    // Get bank account WITH LOCK to prevent race conditions
    const [accounts] = await connection.execute(
      "SELECT * FROM bank_accounts WHERE id = ? AND user_id = ? FOR UPDATE",
      [bank_account_id, userId]
    );
    
    if (accounts.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Bank account not found" 
      });
    }
    
    const account = accounts[0];

    // Get wallet balance WITH LOCK
    const [walletRows] = await connection.execute(
      "SELECT balance FROM wallet WHERE user_id = ? FOR UPDATE",
      [userId]
    );
    
    if (walletRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        success: false,
        message: "Wallet not found" 
      });
    }
    
    const wallet = walletRows[0];
    
    // ✅ CRITICAL FIX: Check balance including transaction fees
    const transactionFee = Math.ceil(amountNum * 0.015); // 1.5% fee example
    const totalDeduction = amountNum + transactionFee;
    
    if (wallet.balance < totalDeduction) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false,
        message: `Insufficient funds. Available: ₦${wallet.balance.toLocaleString()}, Required: ₦${totalDeduction.toLocaleString()} (includes ₦${transactionFee} fee)` 
      });
    }

    // ✅ CRITICAL FIX: Deduct from wallet BEFORE initiating transfer
    await connection.execute(
      "UPDATE wallet SET balance = balance - ? WHERE user_id = ?",
      [totalDeduction, userId]
    );

    // Create Paystack transfer recipient if needed
    let recipientCode = account.recipient_code;
    if (!recipientCode) {
      try {
        const recipientResp = await axios.post(
          "https://api.paystack.co/transferrecipient",
          {
            type: "nuban",
            name: account.account_name,
            account_number: account.account_number,
            bank_code: account.bank_code,
            currency: "NGN"
          },
          { 
            headers: { 
              Authorization: `Bearer ${PAYSTACK_SECRET}`,
              "Content-Type": "application/json"
            } 
          }
        );
        
        if (!recipientResp.data.status) {
          throw new Error(recipientResp.data.message || "Failed to create recipient");
        }
        
        recipientCode = recipientResp.data.data.recipient_code;

        // Save recipient code for future use
        await connection.execute(
          "UPDATE bank_accounts SET recipient_code = ? WHERE id = ?",
          [recipientCode, bank_account_id]
        );
      } catch (err) {
        await connection.rollback();
        console.error("Paystack recipient error:", err.response?.data || err.message);
        return res.status(400).json({ 
          success: false,
          message: "Failed to set up bank account for transfer",
          details: err.response?.data?.message || err.message
        });
      }
    }

    let transferData;
    try {
      // Initiate transfer
      const transferResp = await axios.post(
        "https://api.paystack.co/transfer",
        {
          source: "balance",
          amount: amountNum * 100, // Convert to kobo
          recipient: recipientCode,
          reason: "Wallet withdrawal",
          reference: `WD_${Date.now()}_${userId}`.substring(0, 100) // Custom reference
        },
        { 
          headers: { 
            Authorization: `Bearer ${PAYSTACK_SECRET}`,
            "Content-Type": "application/json"
          } 
        }
      );

      if (!transferResp.data.status) {
        throw new Error(transferResp.data.message || "Transfer failed");
      }

      transferData = transferResp.data.data;
      
      // ✅ FIXED: Log transaction with proper structure
      await connection.execute(
        `INSERT INTO transactions 
         (sender_id, receiver_id, amount, fee, total_amount, type, status, reference, metadata) 
         VALUES (?, ?, ?, ?, ?, 'withdrawal', 'pending', ?, ?)`,
        [
          userId, 
          account.account_number, // Store bank account as receiver
          amountNum,
          transactionFee,
          totalDeduction,
          transferData.reference,
          JSON.stringify({
            bank_name: account.bank_name,
            account_name: account.account_name,
            paystack_transfer_id: transferData.id,
            recipient_code: recipientCode
          })
        ]
      );

      await connection.commit();
      
      // Send success response
      return res.status(200).json({
        success: true,
        message: "Withdrawal initiated successfully",
        data: {
          amount: amountNum,
          fee: transactionFee,
          total: totalDeduction,
          reference: transferData.reference,
          new_balance: wallet.balance - totalDeduction,
          transfer_id: transferData.id,
          status: transferData.status
        }
      });

    } catch (err) {
      // If transfer fails, refund the wallet
      await connection.execute(
        "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
        [totalDeduction, userId]
      );
      
      await connection.rollback();
      
      console.error("Paystack transfer error:", err.response?.data || err.message);
      
      return res.status(400).json({
        success: false,
        message: "Transfer failed",
        details: err.response?.data?.message || err.message
      });
    }

  } catch (err) {
    if (connection) {
      await connection.rollback();
    }
    
    console.error("withdrawFunds error:", err);
    
    return res.status(500).json({ 
      success: false,
      message: "Server error during withdrawal" 
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
*/

// ✅ Webhook for withdrawals (transfers)
/* --------------------------------------------------
   ✅  Webhook for Withdrawals (FIXED)
-------------------------------------------------- */
/*exports.verifyTransfer = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    // Verify webhook signature
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("Invalid webhook signature for transfer");
      return res.status(400).json({ message: "Invalid signature" });
    }

    const event = req.body;
    console.log("Transfer webhook received:", event.event, event.data?.reference);

    if (event.event === "transfer.success") {
      const transferData = event.data;
      const reference = transferData.reference;

      await connection.beginTransaction();

      // Find transaction by reference
      const [transactions] = await connection.execute(
        "SELECT * FROM transactions WHERE reference = ? AND status = 'pending'",
        [reference]
      );

      if (transactions.length > 0) {
        const transaction = transactions[0];
        
        // Update transaction status
        await connection.execute(
          "UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = ?",
          [transaction.id]
        );

        // Log transfer completion
        await connection.execute(
          `INSERT INTO transfer_logs 
           (transaction_id, paystack_transfer_id, status, amount, fees, metadata) 
           VALUES (?, ?, 'success', ?, ?, ?)`,
          [
            transaction.id,
            transferData.id,
            transferData.amount / 100,
            transferData.fees / 100,
            JSON.stringify(transferData)
          ]
        );

        console.log(`Transfer ${reference} marked as completed`);
      } else {
        console.log(`Transaction not found for reference: ${reference}`);
      }

      await connection.commit();
    }

    if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
      const transferData = event.data;
      const reference = transferData.reference;

      await connection.beginTransaction();

      // Find transaction
      const [transactions] = await connection.execute(
        "SELECT * FROM transactions WHERE reference = ? AND status IN ('pending', 'processing')",
        [reference]
      );

      if (transactions.length > 0) {
        const transaction = transactions[0];
        const userId = transaction.sender_id;
        const totalAmount = transaction.total_amount;

        // ✅ CRITICAL: Refund wallet
        await connection.execute(
          "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
          [totalAmount, userId]
        );

        // Update transaction status
        await connection.execute(
          "UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE id = ?",
          [transaction.id]
        );

        // Log failure
        await connection.execute(
          `INSERT INTO transfer_logs 
           (transaction_id, paystack_transfer_id, status, amount, metadata) 
           VALUES (?, ?, 'failed', ?, ?)`,
          [
            transaction.id,
            transferData.id,
            transferData.amount / 100,
            JSON.stringify({
              ...transferData,
              failure_reason: transferData.failure_reason || transferData.reason
            })
          ]
        );

        console.log(`Transfer ${reference} failed, refunded user ${userId}`);
      }

      await connection.commit();
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Transfer webhook error:", err);
    
    if (connection) {
      await connection.rollback();
    }
    
    res.sendStatus(500);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
*/

/* --------------------------------------------------
   ✅  Get Withdrawal History
-------------------------------------------------- */
/*exports.getWithdrawalHistory = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.session.userId;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const [transactions] = await db.execute(
      `SELECT 
        t.id,
        t.amount,
        t.fee,
        t.total_amount,
        t.type,
        t.status,
        t.reference,
        t.created_at,
        t.updated_at,
        t.metadata,
        ba.bank_name,
        ba.account_number,
        ba.account_name
       FROM transactions t
       LEFT JOIN bank_accounts ba ON JSON_EXTRACT(t.metadata, '$.bank_account_id') = ba.id
       WHERE t.sender_id = ? AND t.type = 'withdrawal'
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    const [totalResult] = await db.execute(
      `SELECT COUNT(*) as total 
       FROM transactions 
       WHERE sender_id = ? AND type = 'withdrawal'`,
      [userId]
    );

    res.json({
      success: true,
      transactions: transactions.map(t => ({
        ...t,
        metadata: t.metadata ? JSON.parse(t.metadata) : null
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult[0].total,
        totalPages: Math.ceil(totalResult[0].total / limit)
      }
    });

  } catch (err) {
    console.error("Get withdrawal history error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch withdrawal history" 
    });
  }
};
*/
/* --------------------------------------------------
   ✅  Check Withdrawal Status
-------------------------------------------------- */
/*exports.checkWithdrawalStatus = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { reference } = req.query;
    if (!reference) {
      return res.status(400).json({ 
        success: false,
        message: "Reference is required" 
      });
    }

    // Check local database first
    const [transactions] = await db.execute(
      "SELECT * FROM transactions WHERE reference = ? AND sender_id = ?",
      [reference, req.session.userId]
    );

    if (transactions.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Transaction not found" 
      });
    }

    const transaction = transactions[0];

    // Also check with Paystack for latest status
    try {
      const response = await axios.get(
        `https://api.paystack.co/transfer/${transaction.metadata?.paystack_transfer_id || reference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET}`
          }
        }
      );

      const paystackStatus = response.data.data?.status;

      // Update local status if different
      if (paystackStatus && paystackStatus !== transaction.status) {
        await db.execute(
          "UPDATE transactions SET status = ? WHERE id = ?",
          [paystackStatus, transaction.id]
        );
        
        // If Paystack says it's successful but we have it as pending, update
        if (paystackStatus === 'success' && transaction.status === 'pending') {
          // Already handled in webhook, but good to sync
        }
        
        // If Paystack says it failed but we have it as pending, refund
        if ((paystackStatus === 'failed' || paystackStatus === 'reversed') && 
            (transaction.status === 'pending' || transaction.status === 'processing')) {
          await db.execute(
            "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
            [transaction.total_amount, transaction.sender_id]
          );
        }
      }

      res.json({
        success: true,
        status: paystackStatus || transaction.status,
        transaction: {
          ...transaction,
          metadata: transaction.metadata ? JSON.parse(transaction.metadata) : null
        },
        paystack_data: response.data.data || null
      });

    } catch (paystackErr) {
      // If Paystack check fails, return local status
      res.json({
        success: true,
        status: transaction.status,
        transaction: {
          ...transaction,
          metadata: transaction.metadata ? JSON.parse(transaction.metadata) : null
        },
        note: "Could not fetch latest status from Paystack"
      });
    }

  } catch (err) {
    console.error("Check withdrawal status error:", err);
    res.status(500).json({ 
      success: false,
      message: "Failed to check withdrawal status" 
    });
  }
};
*/

/* --------------------------------------------------
   ✅  Request Withdrawal
-------------------------------------------------- */

