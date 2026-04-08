const express = require ('express');
const router = express.Router();
const { register, login, logout, getCurrentUser, sendCode, verifyCode, createNewPassword } = require ("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

//sign up route
router.post("/register", register);

router.post("/login", login);
router.get("/me", getCurrentUser)


router.post("/logout", authMiddleware, logout);

//reset password
router.post("/send-code", sendCode);
router.post("verify-code", verifyCode);
router.post("/create-new-password", createNewPassword);

module.exports = router;

//This code sets up the sign-up, login and logout, and sets up session and a wallet