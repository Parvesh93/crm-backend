const { getConfig, runOutreach } = require("./outreachService");
const OutreachRun = require("../models/OutreachRun");

let timer = null;

const localHour = (timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = parts.find((part) => part.type === "hour");
  return Number(hour?.value || 0);
};

const checkOutreach = async () => {
  const config = getConfig();

  if (!config.enabled) return;

  const hour = localHour(config.timezone);

  if (hour < config.startHour || hour >= config.endHour) {
    return;
  }

  const active = await OutreachRun.findOne({
    status: "running",
  });

  if (active) return;

  try {
    await runOutreach({ trigger: "scheduled" });
  } catch (error) {
    console.error("Scheduled outreach failed:", error.message);
  }
};

const startOutreachScheduler = () => {
  if (timer) return;

  setTimeout(checkOutreach, 45000);
  timer = setInterval(checkOutreach, 30 * 60 * 1000);
};

module.exports = {
  startOutreachScheduler,
};
