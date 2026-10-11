const crypto = require("crypto");
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
  contactEmail:
    process.env.OUTREACH_CONTACT_EMAIL ||
    process.env.OUTREACH_REPLY_TO ||
    process.env.SMTP_USER ||
    "",
  website:
    process.env.OUTREACH_WEBSITE ||
    "https://ppdesigntech.com",
  phone:
    process.env.OUTREACH_PHONE || "",
  publicBaseUrl:
    (process.env.CRM_API_PUBLIC_URL || "").replace(/\/$/, ""),
  delaySeconds: Math.min(
    Math.max(Number(process.env.OUTREACH_DELAY_SECONDS || 45), 0),
    300
  ),
  followUpsEnabled:
    String(process.env.OUTREACH_FOLLOWUPS_ENABLED || "false") === "true",
});

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

const parseImportedDraft = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return { subject: "", body: "" };

  const lines = raw.split(/\r?\n/);
  let subject = "";

  if (/^subject\s*:/i.test(lines[0] || "")) {
    subject = lines.shift().replace(/^subject\s*:\s*/i, "").trim();
  }

  let body = lines.join("\n").trim();

  body = body
    .replace(
      /\n{1,3}(regards|best regards|kind regards|thanks|thank you),?\s*\n(?:pp design and tech|parvesh)?\s*$/i,
      ""
    )
    .trim();

  return { subject, body };
};

const getStoredDraft = (lead) => {
  const stored =
    String(lead.outreach?.initialDraft || "").trim() ||
    extractDraftFromNotes(lead.notes);

  return parseImportedDraft(stored);
};

const buildSignature = (config) => {
  const lines = [
    "Regards,",
    config.signatureName,
    config.companyName,
  ];

  if (config.contactEmail) {
    lines.push("Email: " + config.contactEmail);
  }

  if (config.phone) {
    lines.push("Phone: " + config.phone);
  }

  if (config.website) {
    lines.push("Website: " + config.website);
  }

  return lines.join("\n");
};

const appendSignature = (body, config) => {
  const clean = String(body || "").trim();
  const signature = buildSignature(config);

  if (!clean) return signature;

  return clean + "\n\n" + signature;
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

const generateInitialEmail = async (lead, config) => {
  const imported = getStoredDraft(lead);

  if (!imported.body) {
    throw new Error(
      "Personalized Email Draft is missing for this lead. Add the draft in the lead spreadsheet and sync again."
    );
  }

  const subject =
    imported.subject || subjectForLead(lead);

  return {
    subject,
    body: appendSignature(imported.body, config),
    source: "Personalized draft from Google Sheet",
  };
};

const generateFollowUp = async (lead, step, config) => {
  const templates = [
    "Just following up on my earlier note in case it got buried. Would it be useful if I shared a concise website-development scope for " +
      (lead.company || "your team") +
      "?",
    "Wanted to check once more whether website, ecommerce or custom development is something your team is considering right now. Happy to share a focused scope if helpful.",
    "I’ll close the loop after this. If website, Shopify or custom development becomes a priority later, I’d be happy to reconnect.",
  ];

  return [
    "Hi " +
      (lead.name && lead.name !== "Company Team"
        ? lead.name
        : "there") +
      ",",
    "",
    templates[Math.max(0, Math.min(step - 1, templates.length - 1))],
    "",
    buildSignature(config),
  ].join("\n");
};

const ensureUnsubscribeToken = async (lead) => {
  if (!lead.outreach) {
    lead.outreach = {};
  }

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

const eligibleQuery = (now, followUpsEnabled) => ({
  email: { $exists: true, $nin: ["", null] },
  convertedClient: null,
  $and: [
    {
      $or: [
        { source: "Email Outreach" },
        { notes: /Imported from PPDT High Ticket Lead Pipeline/i },
      ],
    },
    {
      $or: [
        {
          stage: "New Lead",
          $or: [
            { "outreach.status": "ready" },
            { "outreach.status": { $exists: false } },
            { outreach: { $exists: false } },
          ],
        },
        ...(followUpsEnabled
          ? [
              {
                stage: { $in: ["Contacted", "Follow-up"] },
                "outreach.status": "active",
              },
            ]
          : []),
      ],
    },
    {
      $or: [
        { "outreach.nextSendAt": { $exists: false } },
        { "outreach.nextSendAt": null },
        { "outreach.nextSendAt": { $lte: now } },
      ],
    },
  ],
});

const getOutreachDiagnostics = async () => {
  const now = new Date();
  const config = getConfig();

  const [
    totalLeads,
    withEmail,
    importedOrOutreach,
    newLeads,
    contactedOrFollowUp,
    missingDraft,
    eligible,
  ] = await Promise.all([
    Lead.countDocuments({}),
    Lead.countDocuments({
      email: { $exists: true, $nin: ["", null] },
    }),
    Lead.countDocuments({
      $or: [
        { source: "Email Outreach" },
        { notes: /Imported from PPDT High Ticket Lead Pipeline/i },
      ],
    }),
    Lead.countDocuments({
      stage: "New Lead",
      email: { $exists: true, $nin: ["", null] },
      $or: [
        { source: "Email Outreach" },
        { notes: /Imported from PPDT High Ticket Lead Pipeline/i },
      ],
    }),
    Lead.countDocuments({
      stage: { $in: ["Contacted", "Follow-up"] },
      email: { $exists: true, $nin: ["", null] },
      $or: [
        { source: "Email Outreach" },
        { notes: /Imported from PPDT High Ticket Lead Pipeline/i },
      ],
    }),
    Lead.countDocuments({
      email: { $exists: true, $nin: ["", null] },
      stage: "New Lead",
      $and: [
        {
          $or: [
            { source: "Email Outreach" },
            { notes: /Imported from PPDT High Ticket Lead Pipeline/i },
          ],
        },
        {
          $or: [
            { "outreach.initialDraft": { $exists: false } },
            { "outreach.initialDraft": "" },
            { outreach: { $exists: false } },
          ],
        },
        {
          notes: { $not: /Personalized Email Draft:/i },
        },
      ],
    }),
    Lead.countDocuments(
      eligibleQuery(now, config.followUpsEnabled)
    ),
  ]);

  return {
    totalLeads,
    withEmail,
    importedOrOutreach,
    newLeads,
    contactedOrFollowUp,
    missingDraft,
    eligible,
  };
};

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

const buildPreview = async (lead) => {
  const config = getConfig();

  if (!lead.outreach) {
    lead.outreach = {};
  }

  const currentStep = Number(lead.outreach?.sequenceStep || 0);
  const initialEmail =
    currentStep === 0
      ? await generateInitialEmail(lead, config)
      : null;

  const body =
    currentStep === 0
      ? initialEmail.body
      : await generateFollowUp(lead, currentStep, config);

  const subject =
    currentStep === 0
      ? initialEmail.subject
      : "Re: " + (lead.outreach?.lastSubject || subjectForLead(lead));

  return {
    leadId: lead._id,
    name: lead.name,
    company: lead.company,
    email: lead.email,
    website: lead.website,
    platform: lead.platform?.name || "",
    step: currentStep,
    subject,
    body,
    source:
      currentStep === 0
        ? initialEmail.source
        : "Personalized follow-up",
  };
};

const getLeadPreview = async (leadId) => {
  const lead = await Lead.findById(leadId).populate("platform", "name");

  if (!lead) {
    throw new Error("Lead not found");
  }

  return buildPreview(lead);
};

const getUpcomingPreviews = async (limit = 10) => {
  const config = getConfig();
  const now = new Date();

  const leads = await Lead.find(
    eligibleQuery(now, config.followUpsEnabled)
  )
    .populate("platform", "name")
    .sort({
      "outreach.nextSendAt": 1,
      createdAt: 1,
    })
    .limit(Math.min(Math.max(Number(limit) || 10, 1), 25));

  const previews = [];

  for (const lead of leads) {
    previews.push(await buildPreview(lead));
  }

  return previews;
};

const runOutreach = async ({ trigger = "scheduled" } = {}) => {
  const config = getConfig();
  const run = await OutreachRun.create({
    trigger,
    status: "running",
  });

  try {
    if (!config.publicBaseUrl) {
      throw new Error(
        "CRM_API_PUBLIC_URL is required before outreach can send, so every email has a working unsubscribe link."
      );
    }

    const alreadySent = await countSentToday(config.timezone);
    const remaining = Math.max(0, config.dailyLimit - alreadySent);

    if (remaining === 0) {
      run.status = "completed";
      run.completedAt = new Date();
      await run.save();
      return run;
    }

    const now = new Date();
    const leads = await Lead.find(
      eligibleQuery(now, config.followUpsEnabled)
    )
      .populate("platform", "name")
      .sort({
        "outreach.nextSendAt": 1,
        createdAt: 1,
      })
      .limit(remaining);

    run.candidates = leads.length;

    for (let index = 0; index < leads.length; index += 1) {
      const lead = leads[index];

      try {
        if (!lead.outreach) {
          lead.outreach = {};
        }

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

        const initialEmail =
          currentStep === 0
            ? await generateInitialEmail(lead, config)
            : null;

        const body =
          currentStep === 0
            ? initialEmail.body
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
            ? initialEmail.subject
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
        lead.stage = currentStep === 0 ? "Contacted" : "Follow-up";

        await lead.save();
        run.sent += 1;

        if (
          config.delaySeconds > 0 &&
          index < leads.length - 1
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, config.delaySeconds * 1000)
          );
        }
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
  getLeadPreview,
  getUpcomingPreviews,
  getOutreachDiagnostics,
};
