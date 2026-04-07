const express = require ('express');
const router = express.Router();
const { createTicket, getAllTicketsForUser, deleteTicket, updateTicketStatus } = require("../controllers/ticketController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/create", authMiddleware, createTicket);
router.get("/user/:userId",getAllTicketsForUser);
router.delete("/:ticketId",deleteTicket);
router.put("/status/:ticketId", updateTicketStatus);

module.exports = router;