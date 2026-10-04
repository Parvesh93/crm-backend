const SalesAgentRun = require("../models/SalesAgentRun");
const { getConfig, runSalesAgent } = require("../services/salesAgentService");

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
        provider: config.provider,
        markets: config.markets,
        services: config.services,
        minScore: config.minScore,
        resultsPerQuery: config.resultsPerQuery,
        maxQueriesPerRun: config.maxQueriesPerRun,
        dailyHour: config.dailyHour,
        timezone: config.timezone,
        searchConfigured: Boolean(process.env.SERPER_API_KEY),
        aiConfigured: Boolean(process.env.OPENAI_API_KEY),
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

    runSalesAgent({
      userId: req.user._id,
      trigger: "manual",
    }).catch((error) => {
      console.error("Sales Agent run failed:", error.message);
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getStatus,
  runNow,
};
