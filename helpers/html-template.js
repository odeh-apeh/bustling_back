const otpTemplate = ({ code, title = "Your Verification Code", appName = "Your App", expiresIn = "10 minutes" }) => {
  return `
    <div style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f7fb;padding:30px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">

              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#0A6BFF,#3986f9);padding:30px 32px;color:#ffffff;text-align:center;">
                  <h1 style="margin:0;font-size:26px;font-weight:700;">${title}</h1>
                  <p style="margin:10px 0 0;font-size:14px;opacity:0.95;">
                    ${appName}
                  </p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:36px 32px;text-align:center;">
                  <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.8;">
                    Use the one-time verification code below to continue:
                  </p>

                  <div style="margin:28px auto 24px;display:inline-block;background:#f8fafc;border:2px dashed #3986f9;border-radius:16px;padding:20px 30px;">
                    <p style="margin:0;font-size:34px;letter-spacing:8px;font-weight:700;color:#111827;">
                      ${code}
                    </p>
                  </div>

                  <p style="margin:0 0 14px;font-size:15px;color:#6b7280;line-height:1.7;">
                    This code will expire in <strong>${expiresIn}</strong>.
                  </p>

                  <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
                    If you didn’t request this code, you can safely ignore this email.
                  </p>

                  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:left;">
                    <p style="margin:0;font-size:15px;color:#111827;font-weight:600;">Best regards,</p>
                    <p style="margin:6px 0 0;font-size:14px;color:#6b7280;">
                      ${appName} Security Team
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                    This is an automated security email.<br />
                    Never share your verification code with anyone.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
};

module.exports = otpTemplate;