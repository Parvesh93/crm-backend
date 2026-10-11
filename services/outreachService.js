const crypto = require("crypto");
const OpenAI = require("openai");
const Lead = require("../models/Lead");
const OutreachRun = require("../models/OutreachRun");
const { sendEmail } = require("./notificationService");

const getConfig = () => ({
  enabled: String(process.env.OUTREACH_ENABLED || "false") === "true",
  dailyLimit: Math.min(Number(process.env.OUTREACH_DAILY_LIMIT || 30), 200),
  startHour: Number(process.env.OUTREACH_START_HOUR || 10),
  endHour: Number(process.env.OUTREACH_END_HOUR || 17),
  timezone: process.env.OUTREACH_TIMEZONE || "Asia/Kolkata",
  replyTo:
    process.env.OUTREACH_REPLY_TO ||
    process.env.SMTP_USER ||
    "",
  companyName:
    process.env.OUTREACH_COMPANY_NAME ||
    "PP DESIGN AND TECH",
  signatureName:
    process.env.OUTREACH_SIGNATURE_NAME ||
    "Parvesh",
  publicBaseUrl:
    (process.env.CRM_API_PUBLIC_URL || "").replace(/\/$/, ""),
});

const getOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const extractDraftFromNotes = (notes) => {
  const text = String(notes || "");
  const marker = "Personalized Email Draft:";
  const index = text.indexOf(marker);

  if (index < 0) return "";

  const after = text.slice(index + marker.length).trim();
  const nextMarkers = [
    "\nResearch Notes:",
    "\nSource URL:",
  ];

  let end = after.length;

  for (const markerText of nextMarkers) {
    const markerIndex = after.indexOf(markerText);
    if (markerIndex >= 0) end = Math.min(end, markerIndex);
  }

  return after.slice(0, end).trim();
};

const subjectForLead = (lead) => {
  const company = lead.company || "your team";
  const platform = lead.platform?.name || "";

  if (/shopify/i.test(platform)) {
    return "A Shopify idea for " + company;
  }

  if (/wordpress|woocommerce/i.test(platform)) {
    return "A website improvement idea for " + company;
  }

  return "A development idea for " + company;
};

const generateInitialDraft = async (lead, config) => {
  const stored =
    String(lead.outreach?.initialDraft || "").trim() ||
    extractDraftFromNotes(lead.notes);

  if (stored) return stored;

  const openai = getOpenAI();

  if (!openai) {
    return [
      "Hi " + (lead.name && lead.name !== "Company Team" ? lead.name : "there") + ",",
      "",
      "I came across " + (lead.company || "your company") + " and thought there may be an opportunity to improve the website or ecommerce experience.",
      "",
      "We work on Shopify, custom web development, React/Next.js and ecommerce improvements at " + config.companyName + ".",
      "",
      "Would you be open to a short conversation if this is relevant?",
      "",
      "Regards,",
      config.signatureName,
    ].join("\n");
  }

  const prompt = [
    "Write a concise B2B cold email for PP DESIGN AND TECH.",
    "Do not invent facts.",
    "Do not sound spammy.",
    "Keep it under 130 words.",
    "Use the researched notes only when they support a factual observation.",
    "End with a low-friction question, not a hard sell.",
    "",
    "Lead name: " + (lead.name || ""),
    "Company: " + (lead.company || ""),
    "Website: " + (lead.website || ""),
    "Service/platform: " + (lead.platform?.name || ""),
    "Research notes:",
    String(lead.notes || "").slice(0, 2500),
    "",
    "Return only the email body, no subject line.",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: process.env.OUTREACH_AI_MODEL || "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
  });

  return String(completion.choices[0].message.content || "").trim();
};

const generateFollowUp = async (lead, step, config) => {
  const openai = getOpenAI();

  if (!openai) {
    const templates = [
      "Just following up on my earlier note in case it got buried. Would it be useful if I shared a couple of specific ideas for " + (lead.company || "your website") + "?",
      "Wanted to check once more whether website or ecommerce development is something your team is considering right now. Happy to keep it brief.",
      "I’ll close the loop after this. If website, Shopify or custom development becomes a priority later, I’d be happy to reconnect.",
    ];

    return [
      "Hi " + (lead.name && lead.name !== "Company Team" ? lead.name : "there") + ",",
      "",
      templates[Math.max(0, Math.min(step - 1, templates.length - 1))],
      "",
      "Regards,",
      config.signatureName,
    ].join("\n");
  }

  const prompt = [
    "Write follow-up #" + step + " for a B2B web-development outreach email.",
    "Company: " + (lead.company || ""),
    "Recipient: " + (lead.name || ""),
    "Keep it under 80 words.",
    "Do not invent facts.",
    "Do not repeat the original email verbatim.",
    "Be polite and low-pressure.",
    step >= 3
      ? "This is the final follow-up. Clearly close the loop."
      : "Ask one simple question.",
    "Return only the email body.",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: process.env.OUTREACH_AI_MODEL || "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
  });

  return String(completion.choices[0].message.content || "").trim();
};

const ensureUnsubscribeToken = async (lead) => {
  if (lead.outreach?.unsubscribeToken) {
    return lead.outreach.unsubscribeToken;
  }

  const token = crypto.randomBytes(24).toString("hex");
  lead.outreach.unsubscribeToken = token;
  await lead.save();
  return token;
};

const textToHtml = (text) =>
  escapeHtml(text).replace(/\n/g, "<br>");

const nextGapDays = (nextStep) => {
  if (nextStep === 1) return 3;
  if (nextStep === 2) return 4;
  if (nextStep === 3) return 7;
  return null;
};

const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const eligibleQuery = (now) => ({
  email: { $exists: true, $nin: ["", null] },
  stage: { $in: ["New Lead", "Follow-up", "Contacted"] },
  convertedClient: null,
  "outreach.status": { $in: ["ready", "active"] },
  $or: [
    { "outreach.nextSendAt": { $exists: false } },
    { "outreach.nextSendAt": null },
    { "outreach.nextSendAt": { $lte: now } },
  ],
});

const countSentToday = async (timezone) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const todayKey = formatter.format(new Date());
  const leads = await Lead.find({
    "outreach.lastSentAt": { $exists: true, $ne: null },
  }).select("outreach.lastSentAt");

  return leads.filter((lead) => {
    if (!lead.outreach?.lastSentAt) return false;
    return formatter.format(lead.outreach.lastSentAt) === todayKey;
  }).length;
};

const runOutreach = async ({ trigger = "scheduled" } = {}) => {
  const config = getConfig();
  const run = await OutreachRun.create({
    trigger,
    status: "running",
  });

  try {
    const alreadySent = await countSentToday(config.timezone);
    const remaining = Math.max(0, config.dailyLimit - alreadySent);

    if (remaining === 0) {
      run.status = "completed";
      run.completedAt = new Date();
      await run.save();
      return run;
    }

    const now = new Date();
    const leads = await Lead.find(eligibleQuery(now))
      .populate("platform", "name")
      .sort({
        "outreach.nextSendAt": 1,
        createdAt: 1,
      })
      .limit(remaining);

    run.candidates = leads.length;

    for (const lead of leads) {
      try {
        if (
          !lead.email ||
          lead.stage === "Won" ||
          lead.stage === "Lost" ||
          lead.convertedClient ||
          ["unsubscribed", "replied", "bounced", "paused", "completed"].includes(
            lead.outreach?.status
          )
        ) {
          run.skipped += 1;
          continue;
        }

        const currentStep = Number(lead.outreach?.sequenceStep || 0);
        if (currentStep > 3) {
          lead.outreach.status = "completed";
          await lead.save();
          run.skipped += 1;
          continue;
        }

        const body =
          currentStep === 0
            ? await generateInitialDraft(lead, config)
            : await generateFollowUp(lead, currentStep, config);

        if (!body) {
          run.skipped += 1;
          continue;
        }

        const unsubscribeToken = await ensureUnsubscribeToken(lead);
        const unsubscribeUrl = config.publicBaseUrl
          ? config.publicBaseUrl +
            "/api/outreach/unsubscribe/" +
            unsubscribeToken
          : "";

        const subject =
          currentStep === 0
            ? subjectForLead(lead)
            : "Re: " + (lead.outreach?.lastSubject || subjectForLead(lead));

        const footer = unsubscribeUrl
          ? '<div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280">If you do not want to receive further emails from us, <a href="' +
            unsubscribeUrl +
            '" style="color:#6b7280">unsubscribe here</a>.</div>'
          : "";

        const html =
          '<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6;font-size:14px">' +
          textToHtml(body) +
          footer +
          "</div>";

        const result = await sendEmail({
          to: lead.email,
          subject,
          html,
          text: body + (unsubscribeUrl ? "\n\nUnsubscribe: " + unsubscribeUrl : ""),
          replyTo: config.replyTo || undefined,
        });

        if (!result?.sent) {
          throw new Error(result?.reason || "Email was not sent");
        }

        const sentAt = new Date();
        const nextStep = currentStep + 1;
        const gapDays = nextGapDays(nextStep);

        lead.outreach.status = gapDays ? "active" : "completed";
        lead.outreach.sequenceStep = nextStep;
        lead.outreach.emailCount = Number(lead.outreach.emailCount || 0) + 1;
        lead.outreach.lastSentAt = sentAt;
        lead.outreach.lastSubject = subject;
        lead.outreach.lastMessageId = result.messageId || "";
        lead.outreach.nextSendAt = gapDays
          ? addDays(sentAt, gapDays)
          : undefined;

        lead.lastContactedAt = sentAt;
        lead.nextFollowUp = lead.outreach.nextSendAt;
        lead.stage = gapDays ? "Follow-up" : "Contacted";

        await lead.save();
        run.sent += 1;
      } catch (error) {
        run.failed += 1;
        run.errors.push(
          (lead.company || lead.email || String(lead._id)) +
            ": " +
            error.message
        );
      }
    }

    run.status = "completed";
    run.completedAt = new Date();
    await run.save();
    return run;
  } catch (error) {
    run.status = "failed";
    run.completedAt = new Date();
    run.errors.push(error.message);
    await run.save();
    throw error;
  }
};

const unsubscribeByToken = async (token) => {
  const lead = await Lead.findOne({
    "outreach.unsubscribeToken": token,
  });

  if (!lead) return null;

  lead.outreach.status = "unsubscribed";
  lead.outreach.unsubscribedAt = new Date();
  lead.outreach.nextSendAt = undefined;
  lead.nextFollowUp = undefined;
  lead.stage = lead.stage === "Won" ? "Won" : "Lost";
  await lead.save();

  return lead;
};

module.exports = {
  getConfig,
  runOutreach,
  unsubscribeByToken,
};
