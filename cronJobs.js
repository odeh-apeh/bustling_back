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
    const [rows] = await db.execute(
      "SELECT * FROM escrow WHERE status='pending' AND created_at < NOW() - INTERVAL ? HOUR",
      [AUTO_RELEASE_HOURS]
    );

    for (const escrow of rows) {
      // Move funds to seller wallet
      await db.execute(
        "UPDATE wallets SET balance = balance + ? WHERE user_id = ?",
        [escrow.amount, escrow.seller_id]
      );

      // Mark escrow as released
      await db.execute(
        "UPDATE escrow SET status='released', released_at=NOW() WHERE id=?",
        [escrow.id]
      );

      console.log(`✅ Escrow ${escrow.id} auto-released to seller ${escrow.seller_id}`);
    }
  } catch (error) {
    console.error("❌ Error in cron job:", error.message);
  }
});
