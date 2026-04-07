const database = require('../database/database-handler');

exports.createTicket = async (req, res) => {
    const {userId, subject, description, dateCreated, status, priority, ticketId, email, category} = req.body;
    try{
        const result = await database.insert({
            table: 'tickets',
            data: {
                user_id: userId,
                subject,
                description,
                date_created: dateCreated,
                status,
                priority,
                ticket_id: ticketId,
                email,
                category
            }});
            
        res.status(201).json({ success: true, message: "Ticket created successfully", data: { ticketId: result.id } });
    }catch(e){
        res.status(500).json({ success: false, message: `${e.message}`, data: null });
    }
}

exports.getAllTicketsForUser = async (req, res) => {
    const { userId } = req.params;
    try {
        const tickets = await database.findAll({
            table: 'tickets',
            attribute: 'user_id',
            attributeValue: userId
        });
        res.status(200).json({ success: true, message: "Processed successfully", data: tickets });
    } catch (e) {
        res.status(500).json({ success: false, message: `${e.message}`, data: null });
    }
};

exports.deleteTicket = async (req, res) => {
    const { ticketId } = req.params;
    try {  
            await database.delete({
            table: 'tickets',
            attribute: 'ticket_id',
            attributeValue: ticketId
        });
        res.status(200).json({ success: true, message: "Ticket deleted successfully", data: null });
    }
    catch (e) {
        res.status(500).json({ success: false, message: `${e.message}`, data: null });
    }
}

exports.updateTicketStatus = async (req, res) => {
    const {ticketId} = req.params;
    const { status } = req.body;
    try {
        await database.update({
            table: 'tickets',
            attribute: 'ticket_id',
            attributeValue: ticketId,
            data: { status }
        });
        res.status(200).json({ success: true, message: "Ticket status updated successfully", data: null });
    } catch (e) {
        res.status(500).json({ success: false, message: `${e.message}`, data: null });
    }
}

exports.getAllTickets = async (req,res) => {
    try{
       const tickets = await database.findAll({
            table: 'tickets'
        });
        res.status(200).json({ success: true, message: "Processed successfully", data: tickets });
    }catch(e){
        res.status(500).json({ success: false, message: `${e.message}`, data: null });
    }
}