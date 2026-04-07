const database = require('../database/database-handler');

exports.createTicket = async (req, res) => {
    const {userId, subject, description, dateCreated, status, priority, ticketId} = req.body;
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
            }});
        res.status(201).json({ success: true, message: "Ticket created successfully", ticketId: result.id });
    }catch(e){
        res.status(500).json({ success: false, message: `${e.message}` });
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
        res.status(200).json({ success: true, tickets });
    } catch (e) {
        res.status(500).json({ success: false, message: `${e.message}` });
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
        res.status(200).json({ success: true, message: "Ticket deleted successfully" });
    }
    catch (e) {
        res.status(500).json({ success: false, message: `${e.message}` });
    }
}
