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
    const [users] = await db.execute(
      `SELECT 
        u.id, 
        u.name, 
        u.phone, 
        u.email,
        w.balance
       FROM users u 
       LEFT JOIN wallet w ON u.id = w.user_id 
       WHERE u.phone = ? AND u.id != ?`,
      [phone, req.session.userId]
    );

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
  const connection = await db.getConnection();
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

    await connection.beginTransaction();

    // Check sender balance
    const [senderWallet] = await connection.execute(
      "SELECT * FROM wallet WHERE user_id = ?",
      [senderId]
    );

    if (senderWallet.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Sender wallet not found"
      });
    }

    if (senderWallet[0].balance < amount) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    // Find recipient
    const [recipients] = await connection.execute(
      "SELECT id FROM users WHERE phone = ? AND id != ?",
      [recipientPhone, senderId]
    );

    if (recipients.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Recipient not found"
      });
    }

    const recipientId = recipients[0].id;

    // Check if recipient has wallet
    const [recipientWallet] = await connection.execute(
      "SELECT id FROM wallet WHERE user_id = ?",
      [recipientId]
    );

    if (recipientWallet.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Recipient wallet not found"
      });
    }

    // Deduct from sender
    await connection.execute(
      "UPDATE wallet SET balance = balance - ? WHERE user_id = ?",
      [amount, senderId]
    );

    // Add to recipient
    await connection.execute(
      "UPDATE wallet SET balance = balance + ? WHERE user_id = ?",
      [amount, recipientId]
    );

    // Create transfer record
    const [transferResult] = await connection.execute(
      `INSERT INTO transfers 
       (sender_id, recipient_id, amount, note, status, created_at) 
       VALUES (?, ?, ?, ?, 'completed', NOW())`,
      [senderId, recipientId, amount, note || null]
    );

    const transferId = transferResult.insertId;

    // Log transaction for sender (debit)
    /*await connection.execute(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, transfer_id, created_at) 
       VALUES (?, ?, ?, 'transfer_debit', 'completed', ?, NOW())`,
      [senderId, recipientId, amount, transferId]
    );

    // Log transaction for recipient (credit)
    await connection.execute(
      `INSERT INTO transactions 
       (sender_id, receiver_id, amount, type, status, transfer_id, created_at) 
       VALUES (?, ?, ?, 'transfer_credit', 'completed', ?, NOW())`,
      [senderId, recipientId, amount, transferId]
    );
*/
    await connection.commit();

    // Get transfer details for response
    const [transferDetails] = await connection.execute(
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
       WHERE t.id = ?`,
      [transferId]
    );

    res.json({
      success: true,
      message: "Transfer completed successfully",
      transfer: transferDetails[0]
    });

  } catch (err) {
    await connection.rollback();
    console.error("Transfer Error:", err);
    res.status(500).json({
      success: false,
      message: "Transfer failed"
    });
  } finally {
    connection.release();
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

    const [transfers] = await db.execute(
      `SELECT 
        t.id,
        t.amount,
        t.note,
        t.status,
        t.created_at,
        CASE 
          WHEN t.sender_id = ? THEN 'sent'
          ELSE 'received'
        END as transfer_type,
        CASE 
          WHEN t.sender_id = ? THEN recipient.name
          ELSE sender.name
        END as other_party_name,
        CASE 
          WHEN t.sender_id = ? THEN recipient.phone
          ELSE sender.phone
        END as other_party_phone
       FROM transfers t
       JOIN users sender ON t.sender_id = sender.id
       JOIN users recipient ON t.recipient_id = recipient.id
       WHERE t.sender_id = ? OR t.recipient_id = ?
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, userId, userId, userId, userId, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total 
       FROM transfers 
       WHERE sender_id = ? OR recipient_id = ?`,
      [userId, userId]
    );

    res.json({
      success: true,
      transfers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total
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

    const [transfers] = await db.execute(
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
       WHERE t.id = ? AND (t.sender_id = ? OR t.recipient_id = ?)`,
      [transferId, userId, userId]
    );

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