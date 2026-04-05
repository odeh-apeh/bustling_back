// cronJobs.js
const cron = require("node-cron");
const db = require("./config/db");

// Load environment variables
require("dotenv").config();

const AUTO_RELEASE_HOURS = process.env.AUTO_RELEASE_HOURS || 24; // default 24 hours

// Run every hour to check pending escrows
cron.schedule("0 * * * *", async () => {
  try {
    console.log("⏳ Checking pending escrows...");

    // Get all escrows older than AUTO_RELEASE_HOURS
    // PostgreSQL uses INTERVAL 'X hours' syntax
    const result = await db.query(
      "SELECT * FROM escrow WHERE status='pending' AND created_at < NOW() - INTERVAL '1 hour' * $1",
      [AUTO_RELEASE_HOURS]
    );

    const rows = result.rows;

    for (const escrow of rows) {
      // Move funds to seller wallet
      await db.query(
        "UPDATE wallet SET balance = balance + $1 WHERE user_id = $2",
        [parseFloat(escrow.amount), escrow.seller_id]
      );

      // Mark escrow as released
      await db.query(
        "UPDATE escrow SET status='released', released_at=NOW() WHERE id=$1",
        [escrow.id]
      );

      console.log(`✅ Escrow ${escrow.id} auto-released to seller ${escrow.seller_id}`);
    }
    
    if (rows.length > 0) {
      console.log(`📊 Auto-released ${rows.length} escrow(s)`);
    } else {
      console.log("ℹ️ No pending escrows to auto-release");
    }
  } catch (error) {
    console.error("❌ Error in cron job:", error.message);
  }
});

// Optional: Add a startup log to confirm cron job is running
console.log("🕐 Cron job scheduled: Auto-release escrows every hour");
console.log(`⏰ Auto-release threshold: ${AUTO_RELEASE_HOURS} hours`);