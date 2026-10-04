const SalesAgentRun = require("../models/SalesAgentRun");
const { getConfig, importSheetLeads } = require("../services/salesAgentService");

const getStatus = async (req, res) => {
  try {
    const config = getConfig();

    const latest = await SalesAgentRun.findOne()
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email");

    const recentRuns = await SalesAgentRun.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("createdBy", "name email");

    res.status(200).json({
      config: {
        enabled: config.enabled,
        markets: config.markets,
        dailyHour: config.dailyHour,
        timezone: config.timezone,
        maxRowsPerRun: config.maxRowsPerRun,
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        sourceStatus: config.sourceStatus,
        importedStatus: config.importedStatus,
        duplicateStatus: config.duplicateStatus,
        sheetsConfigured: Boolean(
          process.env.GOOGLE_SHEETS_CLIENT_EMAIL &&
          process.env.GOOGLE_SHEETS_PRIVATE_KEY
        ),
      },
      latest,
      recentRuns,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const runNow = async (req, res) => {
  try {
    const active = await SalesAgentRun.findOne({ status: "running" });

    if (active) {
      return res.status(409).json({
        message: "Sales Agent is already running",
        run: active,
      });
    }

    res.status(202).json({
      message: "Sales Agent run started",
    });

    importSheetLeads({
      userId: req.user._id,
      trigger: "manual",
    }).catch((error) => {
      console.error("Sales Agent sheet import failed:", error.message);
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getStatus,
  runNow,
};
