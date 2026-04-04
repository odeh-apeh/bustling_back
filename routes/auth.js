const express = require ('express');
const router = express.Router();
const { register, login, logout, getCurrentUser } = require ("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

//sign up route
router.post("/register", register);

router.post("/login", login);
router.get("/me", getCurrentUser)


router.post("/logout", authMiddleware, logout);

module.exports = router;

//This code sets up the sign-up, login and logout, and sets up session and a wallet