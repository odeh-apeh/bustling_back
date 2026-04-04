const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const authMiddleware = require("../middlewares/authMiddleware");

// ✅ Wallet balance
router.get("/balance", authMiddleware, walletController.getBalance);

// ✅ Fund wallet (initialize Paystack payment)
router.post("/fund", authMiddleware, walletController.fundWallet);
router.get("/deposits", authMiddleware, walletController.getUserDeposits);

//router.get("/verify-payment", authMiddleware, walletController.verifyPaymentFrontend);

// ✅ Purchase product (money goes into escrow)
router.post("/purchase/:productId", authMiddleware, walletController.purchase);

router.post("/book-service/:serviceId", authMiddleware, walletController.bookService);

//router.get("/withdrawal/status", authMiddleware, walletController.checkWithdrawalStatus);
//router.get("/withdrawal/history", authMiddleware, walletController.getWithdrawalHistory);

// ✅ Confirm received (release funds to seller)
router.post("/confirm-received", authMiddleware, walletController.confirmReceived);

// ✅ Raise a dispute
router.post("/raise-dispute", authMiddleware, walletController.raiseDispute);

// ✅ Resolve dispute (admin only, add admin auth later)
router.post("/resolve-dispute", authMiddleware, walletController.resolveDispute);

// ✅ Add bank account
//router.post("/add-bank", authMiddleware, walletController.addBankAccount);

// ✅ List bank accounts (correction: your code had withdraw here)
//router.get("/banks", authMiddleware, walletController.listBankAccounts);

//router.get("/banks/list", authMiddleware, walletController.getBanks);

// Add this route to your wallet routes file
//router.post("/resolve-account", authMiddleware, walletController.resolveAccount);

// ✅ Withdraw funds
router.post("/withdraw", authMiddleware, walletController.requestWithdrawal);

// ✅ Webhook: Paystack payment verification
/*router.post(
  "/webhook/payment",
  express.raw({ type: "application/json" }),
  walletController.verifyPayment
);

// ✅ Webhook: Paystack transfer (withdrawals)
router.post(
  "/webhook/transfer",
  express.raw({ type: "application/json" }),
  walletController.verifyTransfer
);
*/
module.exports = router;
