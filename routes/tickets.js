const express = require ('express');
const router = express.Router();
const { createTicket, getAllTicketsForUser, deleteTicket, updateTicketStatus, getAllTickets, emailUser } = require("../controllers/ticketController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/create", authMiddleware, createTicket);
router.get("/user/:userId",getAllTicketsForUser);
router.delete("/:ticketId",deleteTicket);
router.put("/status/:ticketId", updateTicketStatus);
router.get("/all", getAllTickets);
router.post("/email-user", emailUser);

module.exports = router;