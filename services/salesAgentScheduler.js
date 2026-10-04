const User = require("../models/User");
const SalesAgentRun = require("../models/SalesAgentRun");
const { getConfig, importSheetLeads } = require("./salesAgentService");

let timer = null;

const zonedParts = (timezone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  return Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
};

const checkScheduledRun = async () => {
  const config = getConfig();
  if (!config.enabled) return;

  try {
    const parts = zonedParts(config.timezone);
    const hour = Number(parts.hour);

    if (hour !== config.dailyHour) return;

    const todayKey =
      parts.year + "-" + parts.month + "-" + parts.day;

    const recentScheduledRuns = await SalesAgentRun.find({
      trigger: "scheduled",
    })
      .sort({ createdAt: -1 })
      .limit(5);

    const alreadyRanToday = recentScheduledRuns.some((run) => {
      const runParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: config.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(run.createdAt);

      const map = Object.fromEntries(
        runParts.map((part) => [part.type, part.value])
      );

      return (
        map.year + "-" + map.month + "-" + map.day === todayKey
      );
    });

    if (alreadyRanToday) return;

    const running = await SalesAgentRun.findOne({
      status: "running",
    });

    if (running) return;

    const superAdmin = await User.findOne({
      role: "super_admin",
      isActive: true,
    }).select("_id");

    if (!superAdmin) {
      console.error(
        "Sales Agent scheduler: no active super_admin found"
      );
      return;
    }

    importSheetLeads({
      userId: superAdmin._id,
      trigger: "scheduled",
    }).catch((error) => {
      console.error(
        "Scheduled Sales Agent sheet import failed:",
        error.message
      );
    });
  } catch (error) {
    console.error(
      "Sales Agent scheduler error:",
      error.message
    );
  }
};

const startSalesAgentScheduler = () => {
  if (timer) return;

  setTimeout(checkScheduledRun, 30000);
  timer = setInterval(checkScheduledRun, 15 * 60 * 1000);
};

module.exports = {
  startSalesAgentScheduler,
};
