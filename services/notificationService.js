const nodemailer = require("nodemailer");

const getFrontendUrl = () =>
  (process.env.CRM_FRONTEND_URL || "https://app.ppdesigntech.com").replace(/\/$/, "");

const createTransporter = () => {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendEmail = async ({ to, subject, html }) => {
  if (!to) return { skipped: true, reason: "No email" };

  const transporter = createTransporter();
  if (!transporter) {
    return { skipped: true, reason: "SMTP not configured" };
  }

  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      `PPDT CRM <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });

  return { sent: true };
};

const normalizePhone = (phone) => {
  if (!phone) return null;

  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10 && process.env.WHATSAPP_DEFAULT_COUNTRY_CODE) {
    return `${process.env.WHATSAPP_DEFAULT_COUNTRY_CODE}${digits}`;
  }

  return digits;
};

const sendWhatsAppTemplate = async ({
  to,
  eventLabel,
  taskTitle,
  detail,
  taskUrl,
}) => {
  const phone = normalizePhone(to);

  if (!phone) {
    return { skipped: true, reason: "No WhatsApp number" };
  }

  const {
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_TEMPLATE_NAME,
    WHATSAPP_TEMPLATE_LANGUAGE = "en",
  } = process.env;

  if (
    !WHATSAPP_ACCESS_TOKEN ||
    !WHATSAPP_PHONE_NUMBER_ID ||
    !WHATSAPP_TEMPLATE_NAME
  ) {
    return { skipped: true, reason: "WhatsApp not configured" };
  }

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: {
            code: WHATSAPP_TEMPLATE_LANGUAGE,
          },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: eventLabel },
                { type: "text", text: taskTitle },
                { type: "text", text: detail },
                { type: "text", text: taskUrl },
              ],
            },
          ],
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "WhatsApp notification failed"
    );
  }

  return { sent: true, data };
};

const notifyTaskAssignee = async ({
  assignee,
  task,
  actor,
  eventLabel,
  detail,
}) => {
  if (!assignee || !task) return;

  if (
    actor?._id &&
    String(actor._id) === String(assignee._id)
  ) {
    return;
  }

  const taskUrl = `${getFrontendUrl()}/tasks/${task._id}`;
  const actorName = actor?.name || "A team member";

  const safeDetail = detail || "The task has been updated.";

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
      <h2 style="margin-bottom:8px">PPDT CRM Task Notification</h2>
      <p><strong>${eventLabel}</strong></p>
      <p><strong>Task:</strong> ${task.title}</p>
      <p><strong>By:</strong> ${actorName}</p>
      <p>${safeDetail}</p>
      <p style="margin-top:24px">
        <a href="${taskUrl}" style="background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">
          Open Task
        </a>
      </p>
    </div>
  `;

  const results = await Promise.allSettled([
    sendEmail({
      to: assignee.email,
      subject: `PPDT CRM: ${eventLabel} - ${task.title}`,
      html: emailHtml,
    }),
    sendWhatsAppTemplate({
      to: assignee.phone,
      eventLabel,
      taskTitle: task.title,
      detail: `${actorName}: ${safeDetail}`,
      taskUrl,
    }),
  ]);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Notification error:", result.reason?.message || result.reason);
    }
  });
};

module.exports = {
  notifyTaskAssignee,
};
