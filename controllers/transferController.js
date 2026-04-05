// backend/controllers/transferController.js
const db = require("../config/db");

/* --------------------------------------------------
   ✅  Lookup User by Phone/Wallet Address
-------------------------------------------------- */
exports.lookupUser = async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }

    // Find user by phone (wallet address)
    const result = await db.query(
      `SELECT 
        u.id, 
        u.name, 
        u.phone, 
        u.email,
        w.balance
       FROM users u 
       LEFT JOIN wallet w ON u.id = w.user_id 
       WHERE u.phone = $1 AND u.id != $2`,
      [phone, req.session.userId]
    );

    const users = result.rows;

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = users[0];

    // Return limited info for security
    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        // Don't return balance for security
      }
    });

  } catch (err) {
    console.error("Lookup User Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

/* --------------------------------------------------
   ✅  Initiate Transfer
-------------------------------------------------- */
exports.initiateTransfer = async (req, res) => {
  const client = await db.connect();
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { recipientPhone, amount, note } = req.body;
    const senderId = req.session.userId;

    if (!recipientPhone || !amount) {
      return res.status(400).json({
        success: false,
        message: "Recipient phone and amount are required"
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0"
      });
    }

    await client.query('BEGIN');

    // Check sender balance
    const senderWalletResult = await client.query(
      "SELECT * FROM wallet WHERE user_id = $1",
      [senderId]
    );

    if (senderWalletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Sender wallet not found"
      });
    }

    if (parseFloat(senderWalletResult.rows[0].balance) < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    // Find recipient
    const recipientsResult = await client.query(
      "SELECT id FROM users WHERE phone = $1 AND id != $2",
      [recipientPhone, senderId]
    );

    if (recipientsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Recipient not found"
      });
    }

    const recipientId = recipientsResult.rows[0].id;

    // Check if recipient has wallet
    const recipientWalletResult = await client.query(
      "SELECT id FROM wallet WHERE user_id = $1",
      [recipientId]
    );

    if (recipientWalletResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Recipient wallet not found"
      });
    }

    // Deduct from sender
    await client.query(
      "UPDATE wallet SET balance = balance - $1 WHERE user_id = $2",
      [amount, senderId]
    );

    // Add to recipient
    await client.query(
      "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
      [amount, recipientId]
    );

    // Create transfer record
    const transferResult = await client.query(
      `INSERT INTO transfers 
       (sender_id, recipient_id, amount, note, status, created_at) 
       VALUES ($1, $2, $3, $4, 'completed', NOW())
       RETURNING id`,
      [senderId, recipientId, amount, note || null]
    );

    const transferId = transferResult.rows[0].id;

    // Log transaction for sender (debit) - commented out as in original
    /*await client.query(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, transfer_id, created_at) 
       VALUES ($1, $2, $3, 'transfer_debit', 'completed', $4, NOW())`,
      [senderId, recipientId, amount, transferId]
    );

    // Log transaction for recipient (credit)
    await client.query(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, transfer_id, created_at) 
       VALUES ($1, $2, $3, 'transfer_credit', 'completed', $4, NOW())`,
      [senderId, recipientId, amount, transferId]
    );*/

    await client.query('COMMIT');

    // Get transfer details for response
    const transferDetailsResult = await client.query(
      `SELECT 
        t.id, 
        t.amount, 
        t.note,
        t.status,
        t.created_at,
        sender.name as sender_name,
        sender.phone as sender_phone,
        recipient.name as recipient_name,
        recipient.phone as recipient_phone
       FROM transfers t
       JOIN users sender ON t.sender_id = sender.id
       JOIN users recipient ON t.recipient_id = recipient.id
       WHERE t.id = $1`,
      [transferId]
    );

    res.json({
      success: true,
      message: "Transfer completed successfully",
      transfer: transferDetailsResult.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Transfer Error:", err);
    res.status(500).json({
      success: false,
      message: "Transfer failed"
    });
  } finally {
    client.release();
  }
};

/* --------------------------------------------------
   ✅  Get Transfer History
-------------------------------------------------- */
exports.getTransferHistory = async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.session.userId;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const pageLimit = parseInt(limit);
    const pageOffset = parseInt(offset);

    const transfersResult = await db.query(
      `SELECT 
        t.id,
        t.amount,
        t.note,
        t.status,
        t.created_at,
        CASE 
          WHEN t.sender_id = $1 THEN 'sent'
          ELSE 'received'
        END as transfer_type,
        CASE 
          WHEN t.sender_id = $1 THEN recipient.name
          ELSE sender.name
        END as other_party_name,
        CASE 
          WHEN t.sender_id = $1 THEN recipient.phone
          ELSE sender.phone
        END as other_party_phone
       FROM transfers t
       JOIN users sender ON t.sender_id = sender.id
       JOIN users recipient ON t.recipient_id = recipient.id
       WHERE t.sender_id = $1 OR t.recipient_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageLimit, pageOffset]
    );

    const transfers = transfersResult.rows;

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total 
       FROM transfers 
       WHERE sender_id = $1 OR recipient_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      transfers,
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total: parseInt(countResult.rows[0].total)
      }
    });

  } catch (err) {
    console.error("Transfer History Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transfer history"
    });
  }
};

/* --------------------------------------------------
   ✅  Get Transfer Details
-------------------------------------------------- */
exports.getTransferDetails = async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { transferId } = req.params;
    const userId = req.session.userId;

    const transfersResult = await db.query(
      `SELECT 
        t.id,
        t.amount,
        t.note,
        t.status,
        t.created_at,
        sender.name as sender_name,
        sender.phone as sender_phone,
        recipient.name as recipient_name,
        recipient.phone as recipient_phone
       FROM transfers t
       JOIN users sender ON t.sender_id = sender.id
       JOIN users recipient ON t.recipient_id = recipient.id
       WHERE t.id = $1 AND (t.sender_id = $2 OR t.recipient_id = $2)`,
      [transferId, userId]
    );

    const transfers = transfersResult.rows;

    if (transfers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Transfer not found"
      });
    }

    res.json({
      success: true,
      transfer: transfers[0]
    });

  } catch (err) {
    console.error("Transfer Details Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transfer details"
    });
  }
};