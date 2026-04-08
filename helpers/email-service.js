const SibApiV3Sdk = require('sib-api-v3-sdk');

class EmailService {
  constructor() {
    if (!process.env.BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY is missing from environment variables");
    }

    if (!process.env.BREVO_SENDER_EMAIL) {
      throw new Error("BREVO_SENDER_EMAIL is missing from environment variables");
    }

    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;

    this.tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();
    this.senderEmail = process.env.BREVO_SENDER_EMAIL;
    this.senderName = process.env.BREVO_SENDER_NAME || "Customer Support Team";
  }

  escapeHtml(unsafe = "") {
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async sendEmail({ to, subject, htmlContent, textContent }) {
    try {
      const response = await this.tranEmailApi.sendTransacEmail({
        sender: {
          email: this.senderEmail,
          name: this.senderName
        },
        to: Array.isArray(to)
          ? to.map(email => ({ email }))
          : [{ email: to }],
        subject,
        htmlContent,
        textContent
      });

      return {
        success: true,
        messageId: response?.messageId || null,
        data: response
      };
    } catch (error) {
      console.error("Brevo Email Error:", error.response?.body || error.message);

      return {
        success: false,
        error: error.response?.body?.message || error.message || "Failed to send email",
        raw: error.response?.body || null
      };
    }
  }

  async sendTemplateEmail({ to, templateId, params = {}, subject }) {
    try {
      const response = await this.tranEmailApi.sendTransacEmail({
        sender: {
          email: this.senderEmail,
          name: this.senderName
        },
        to: Array.isArray(to)
          ? to.map(email => ({ email }))
          : [{ email: to }],
        templateId,
        params,
        ...(subject ? { subject } : {})
      });

      return {
        success: true,
        messageId: response?.messageId || null,
        data: response
      };
    } catch (error) {
      console.error("Brevo Template Email Error:", error.response?.body || error.message);

      return {
        success: false,
        error: error.response?.body?.message || error.message || "Failed to send template email",
        raw: error.response?.body || null
      };
    }
  }
}



module.exports = new EmailService();