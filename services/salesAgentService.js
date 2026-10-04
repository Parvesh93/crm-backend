const crypto = require("crypto");
const Lead = require("../models/Lead");
const Platform = require("../models/Platform");
const SalesAgentRun = require("../models/SalesAgentRun");

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const splitEnv = (value, fallback) =>
  String(value || fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getConfig = () => ({
  enabled: String(process.env.SALES_AGENT_ENABLED || "false") === "true",
  spreadsheetId:
    process.env.SALES_AGENT_SHEET_ID ||
    "18DveRzUoe9llquHtVO7gYzfmrCkmcNRnaOQMvTw-GH0",
  sheetName: process.env.SALES_AGENT_SHEET_NAME || "Leads",
  sourceStatus:
    process.env.SALES_AGENT_SOURCE_STATUS || "Qualified - not contacted",
  importedStatus:
    process.env.SALES_AGENT_IMPORTED_STATUS || "Imported to CRM",
  duplicateStatus:
    process.env.SALES_AGENT_DUPLICATE_STATUS || "Skipped - duplicate CRM",
  dailyHour: Number(process.env.SALES_AGENT_DAILY_HOUR || 10),
  timezone: process.env.SALES_AGENT_TIMEZONE || "Asia/Kolkata",
  maxRowsPerRun: Math.min(
    Number(process.env.SALES_AGENT_MAX_ROWS_PER_RUN || 100),
    500
  ),
  markets: splitEnv(
    process.env.SALES_AGENT_MARKETS,
    "India,United States,United Kingdom,UAE"
  ),
});

const base64Url = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const getGoogleAccessToken = async () => {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (!clientEmail || !rawPrivateKey) {
    throw new Error(
      "Google Sheets service account is not configured. Add GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY."
    );
  }

  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);

  const header = base64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  );

  const claim = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: SHEETS_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const unsigned = header + "." + claim;

  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(unsigned), privateKey)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const assertion = unsigned + "." + signature;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        "Unable to authenticate with Google Sheets"
    );
  }

  return data.access_token;
};

const columnLetter = (index) => {
  let n = index + 1;
  let output = "";

  while (n > 0) {
    const remainder = (n - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    n = Math.floor((n - 1) / 26);
  }

  return output;
};

const readSheetRows = async (config, token) => {
  const range =
    encodeURIComponent(config.sheetName + "!A1:Z1000");

  const response = await fetch(
    "https://sheets.googleapis.com/v4/spreadsheets/" +
      config.spreadsheetId +
      "/values/" +
      range +
      "?majorDimension=ROWS",
    {
      headers: {
        Authorization: "Bearer " + token,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Unable to read lead spreadsheet"
    );
  }

  return data.values || [];
};

const updateSheetStatuses = async (
  config,
  token,
  statusColumnIndex,
  updates
) => {
  if (!updates.length) return;

  const letter = columnLetter(statusColumnIndex);

  const data = updates.map((item) => ({
    range:
      config.sheetName +
      "!" +
      letter +
      item.rowNumber,
    values: [[item.status]],
  }));

  const response = await fetch(
    "https://sheets.googleapis.com/v4/spreadsheets/" +
      config.spreadsheetId +
      "/values:batchUpdate",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
        "Unable to update spreadsheet lead statuses"
    );
  }
};

const normalizeHeader = (value) =>
  String(value || "").trim().toLowerCase();

const rowToObject = (headers, row) => {
  const data = {};

  headers.forEach((header, index) => {
    data[normalizeHeader(header)] = row[index] ?? "";
  });

  return data;
};

const rootUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol + "//" + url.host;
  } catch {
    return String(value || "").trim();
  }
};

const domainKey = (value) => {
  try {
    return new URL(String(value || "").trim())
      .hostname.replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return "";
  }
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^()|[\]\\]/g, "\\$&");

const isDuplicate = async ({ email, website }) => {
  const clauses = [];

  if (email) {
    clauses.push({
      email: String(email).trim().toLowerCase(),
    });
  }

  const domain = domainKey(website);

  if (domain) {
    clauses.push({
      website: new RegExp(escapeRegex(domain), "i"),
    });
  }

  if (!clauses.length) return false;

  return Boolean(
    await Lead.findOne({ $or: clauses }).select("_id")
  );
};

const fitScoreNumber = (value) => {
  const text = String(value || "").trim();

  const tenScale = text.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*10/);
  if (tenScale) {
    return Math.max(
      0,
      Math.min(100, Number(tenScale[1]) * 10)
    );
  }

  const percent = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (percent) {
    return Math.max(0, Math.min(100, Number(percent[1])));
  }

  const number = Number(text);
  if (!Number.isNaN(number)) {
    return number <= 10 ? number * 10 : Math.min(number, 100);
  }

  return 50;
};

const parseEstimatedValue = (value) => {
  const text = String(value || "")
    .replace(/,/g, "")
    .trim()
    .toUpperCase();

  if (!text) return 0;

  const values = [
    ...text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*([LKC]?)/g),
  ]
    .map((match) => {
      const number = Number(match[1]);
      const suffix = match[2];

      if (suffix === "L") return number * 100000;
      if (suffix === "K") return number * 1000;
      if (suffix === "C") return number * 10000000;

      return number;
    })
    .filter((number) => Number.isFinite(number) && number > 0);

  if (!values.length) return 0;

  if (values.length >= 2) {
    return Math.round((values[0] + values[1]) / 2);
  }

  return Math.round(values[0]);
};

const findPlatform = async (value) => {
  const platform = String(value || "").trim();

  if (!platform) return null;

  const mappings = [
    [/shopify/i, /shopify/i],
    [/wordpress|woocommerce/i, /wordpress|woocommerce/i],
    [/next|react|custom/i, /custom/i],
    [/figma|ui\/ux|design/i, /figma|ui\/ux|design/i],
    [/maintenance/i, /maintenance/i],
  ];

  const mapping = mappings.find(([source]) => source.test(platform));
  if (!mapping) return null;

  return Platform.findOne({ name: mapping[1] });
};

const buildNotes = (row, rowNumber) =>
  [
    "Imported from PPDT High Ticket Lead Pipeline - row " +
      rowNumber,
    row["fit score"]
      ? "Fit Score: " + row["fit score"]
      : "",
    row["country"] ? "Country: " + row["country"] : "",
    row["city/region"]
      ? "City/Region: " + row["city/region"]
      : "",
    row["industry"] ? "Industry: " + row["industry"] : "",
    row["opportunity spotted"]
      ? "Opportunity: " + row["opportunity spotted"]
      : "",
    row["outreach angle"]
      ? "Outreach Angle: " + row["outreach angle"]
      : "",
    row["personalized email draft"]
      ? "Personalized Email Draft:\n" +
        row["personalized email draft"]
      : "",
    row["notes"] ? "Research Notes: " + row["notes"] : "",
    row["source url"]
      ? "Source URL: " + row["source url"]
      : "",
  ]
    .filter(Boolean)
    .join("\n");

const importSheetLeads = async ({
  userId,
  trigger = "manual",
}) => {
  const config = getConfig();

  const run = await SalesAgentRun.create({
    status: "running",
    trigger,
    markets: config.markets,
    services: ["Google Sheet Import"],
    queries: [
      config.sheetName + ": " + config.sourceStatus,
    ],
    createdBy: userId,
  });

  try {
    const token = await getGoogleAccessToken();
    const rows = await readSheetRows(config, token);

    if (!rows.length) {
      throw new Error("Lead spreadsheet is empty");
    }

    const headers = rows[0];
    const statusColumnIndex = headers.findIndex(
      (header) => normalizeHeader(header) === "status"
    );

    if (statusColumnIndex < 0) {
      throw new Error("Status column was not found in Leads sheet");
    }

    const statusUpdates = [];
    let processed = 0;

    for (
      let index = 1;
      index < rows.length &&
      processed < config.maxRowsPerRun;
      index += 1
    ) {
      const row = rowToObject(headers, rows[index]);
      const status = String(row.status || "").trim();

      if (
        status.toLowerCase() !==
        config.sourceStatus.toLowerCase()
      ) {
        continue;
      }

      processed += 1;
      run.found += 1;

      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      const website = String(row.website || "").trim();
      const company = String(row.company || "").trim();

      if (!company || (!email && !website)) {
        run.rejected += 1;
        continue;
      }

      if (await isDuplicate({ email, website })) {
        run.duplicates += 1;
        statusUpdates.push({
          rowNumber: index + 1,
          status: config.duplicateStatus,
        });
        continue;
      }

      const platform = await findPlatform(row.platform);
      const fitScore = fitScoreNumber(row["fit score"]);

      const lead = await Lead.create({
        name:
          String(row["decision maker"] || "").trim() ||
          "Company Team",
        company,
        email: email || undefined,
        website: rootUrl(website),
        platform: platform?._id,
        owner: userId,
        source: "Email Outreach",
        stage: "New Lead",
        probability: Math.min(
          60,
          Math.max(10, Math.round(fitScore / 2))
        ),
        estimatedValue: parseEstimatedValue(
          row["estimated project value"]
        ),
        notes: buildNotes(row, index + 1),
        createdBy: userId,
      });

      if (lead) {
        run.withEmail += email ? 1 : 0;
        run.qualified += 1;
        run.inserted += 1;

        statusUpdates.push({
          rowNumber: index + 1,
          status: config.importedStatus,
        });
      }
    }

    await updateSheetStatuses(
      config,
      token,
      statusColumnIndex,
      statusUpdates
    );

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

module.exports = {
  getConfig,
  importSheetLeads,
};
