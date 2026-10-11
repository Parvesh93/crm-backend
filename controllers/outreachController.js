const OutreachRun = require("../models/OutreachRun");
const {
  getConfig,
  runOutreach,
  unsubscribeByToken,
  getLeadPreview,
  getUpcomingPreviews,
  getOutreachDiagnostics,
} = require("../services/outreachService");

const getOutreachStatus = async (req, res) => {
  try {
    const config = getConfig();
    const recentRuns = await OutreachRun.find()
      .sort({ createdAt: -1 })
      .limit(20);

    const diagnostics = await getOutreachDiagnostics();

    res.status(200).json({
      config: {
        enabled: config.enabled,
        dailyLimit: config.dailyLimit,
        startHour: config.startHour,
        endHour: config.endHour,
        timezone: config.timezone,
        replyTo: config.replyTo,
        followUpsEnabled: config.followUpsEnabled,
        unsubscribeConfigured: Boolean(config.publicBaseUrl),
        smtpConfigured: Boolean(
          process.env.SMTP_HOST &&
          process.env.SMTP_USER &&
          process.env.SMTP_PASS
        ),
      },
      recentRuns,
      diagnostics,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const runOutreachNow = async (req, res) => {
  try {
    const active = await OutreachRun.findOne({
      status: "running",
    });

    if (active) {
      return res.status(409).json({
        message: "An outreach run is already in progress",
      });
    }

    res.status(202).json({
      message: "Outreach run started",
    });

    runOutreach({ trigger: "manual" }).catch((error) => {
      console.error("Manual outreach failed:", error.message);
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const previewLeadEmail = async (req, res) => {
  try {
    const preview = await getLeadPreview(req.params.leadId);
    res.status(200).json({ preview });
  } catch (error) {
    res.status(error.message === "Lead not found" ? 404 : 500).json({
      message: error.message,
    });
  }
};

const previewUpcomingEmails = async (req, res) => {
  try {
    const previews = await getUpcomingPreviews(req.query.limit || 10);
    res.status(200).json({
      count: previews.length,
      previews,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const unsubscribeLead = async (req, res) => {
  try {
    const lead = await unsubscribeByToken(req.params.token);

    if (!lead) {
      return res
        .status(404)
        .send("This unsubscribe link is invalid or has expired.");
    }

    res
      .status(200)
      .send(
        "You have been unsubscribed successfully and will not receive further outreach emails from PP DESIGN AND TECH."
      );
  } catch (error) {
    res.status(500).send("Unable to process unsubscribe request.");
  }
};

module.exports = {
  getOutreachStatus,
  runOutreachNow,
  previewLeadEmail,
  previewUpcomingEmails,
  unsubscribeLead,
};
