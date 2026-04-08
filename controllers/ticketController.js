const database = require('../database/database-handler');
const SibApiV3Sdk = require('sib-api-v3-sdk');

// Brevo setup
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();


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
        await database.updateById({
            table: 'tickets',
            id: ticketId,
            data: { status },
            attribute: 'ticket_id'
        });
        res.status(200).json({ success: true, message: "Ticket status updated successfully", data: null });
    } catch (e) {
        res.status(500).json({ success: false, message: `${e.message}`, data: null });
    }
}

exports.getAllTickets = async (req,res) => {
    try{
       const tickets = await database.findAll({
            table: 'tickets',
            hasAttribute: false
        });
        res.status(200).json({ success: true, message: "Processed successfully", data: tickets });
    }catch(e){
        res.status(500).json({ success: false, message: `${e.message}`, data: null });
    }
}



exports.emailUser = async (req, res) => {
  const { email, subject, message, ticket_id } = req.body;

  if (!email || !subject || !message) {
    return res.status(400).json({
      success: false,
      message: "Email, subject and message are required",
      data: null
    });
  }

  const htmlTemplate = `
    <div style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f7fb;padding:30px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">
              
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#0A6BFF,#3986f9);padding:28px 32px;color:#ffffff;">
                  <h1 style="margin:0;font-size:24px;font-weight:700;">Support Ticket Update</h1>
                  <p style="margin:8px 0 0;font-size:14px;opacity:0.95;">
                    Ticket ID: <strong>#${ticket_id || 'N/A'}</strong>
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
                    Hello,
                  </p>

                  <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
                    We’ve reviewed your support request and sent an update regarding your ticket:
                  </p>

                  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                      Subject
                    </p>
                    <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">
                      ${subject}
                    </p>
                  </div>

                  <div style="background:#f9fafb;border-left:4px solid #3986f9;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
                    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                      Message from Support
                    </p>
                    <p style="margin:0;font-size:15px;color:#374151;line-height:1.8;white-space:pre-line;">
                      ${message}
                    </p>
                  </div>

                  <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">
                    If you still need help or have additional questions, feel free to reply or create another support request.
                  </p>

                  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:15px;color:#111827;font-weight:600;">Best regards,</p>
                    <p style="margin:6px 0 0;font-size:14px;color:#6b7280;">
                      Customer Support Team
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                    This is an automated support response.<br />
                    Please do not share sensitive personal information by email.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  try {
    const response = await tranEmailApi.sendTransacEmail({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: "Bustling Customer Support Team"
      },
      to: [
        {
          email: email
        }
      ],
      subject: `Response to your ticket #${ticket_id}: ${subject}`,
      htmlContent: htmlTemplate,
      textContent: message
    });

    // If email was sent successfully, close the ticket
    if (response && response.messageId) {
      await database.updateById({
        table: 'tickets',
        id: ticket_id,
        data: { status: 'close' },
        attribute: 'ticket_id'
      });
    }

    return res.status(200).json({
      success: true,
      message: "Email sent successfully",
      data: response
    });

  } catch (e) {
    console.error("Brevo Email Error:", e.response?.body || e.message);

    return res.status(500).json({
      success: false,
      message: e.response?.body?.message || e.message || "Failed to send email",
      data: null
    });
  }
};