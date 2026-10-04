const OpenAI = require("openai");
const Lead = require("../models/Lead");
const Platform = require("../models/Platform");
const SalesAgentRun = require("../models/SalesAgentRun");

const getOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const splitEnv = (value, fallback) =>
  String(value || fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getConfig = () => ({
  enabled: String(process.env.SALES_AGENT_ENABLED || "false") === "true",
  provider: process.env.SALES_AGENT_SEARCH_PROVIDER || "serper",
  markets: splitEnv(
    process.env.SALES_AGENT_MARKETS,
    "India,United States,United Kingdom,UAE"
  ),
  services: splitEnv(
    process.env.SALES_AGENT_SERVICES,
    "Shopify development,custom web development,Next.js development,WordPress development,ecommerce development"
  ),
  minScore: Number(process.env.SALES_AGENT_MIN_SCORE || 65),
  resultsPerQuery: Math.min(Number(process.env.SALES_AGENT_RESULTS_PER_QUERY || 5), 10),
  maxQueriesPerRun: Math.min(Number(process.env.SALES_AGENT_MAX_QUERIES || 8), 30),
  dailyHour: Number(process.env.SALES_AGENT_DAILY_HOUR || 10),
  timezone: process.env.SALES_AGENT_TIMEZONE || "Asia/Kolkata",
});

const cleanUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
};

const rootUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol + "//" + url.host;
  } catch {
    return "";
  }
};

const domainKey = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^()|[\]\\]/g, "\\$&");

const searchSerper = async (query, num) => {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY is not configured");

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Lead search failed");
  }

  return (data.organic || []).map((row) => ({
    title: row.title || "",
    website: cleanUrl(row.link || ""),
    snippet: row.snippet || "",
    sourceUrl: row.link || "",
  }));
};

const searchWeb = async (query, num) => {
  const provider = String(
    process.env.SALES_AGENT_SEARCH_PROVIDER || "serper"
  ).toLowerCase();

  if (provider === "serper") return searchSerper(query, num);

  throw new Error("Unsupported search provider: " + provider);
};

const fetchText = async (url) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 PPDT-Sales-Agent/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timer);

    if (!response.ok) return "";
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return "";

    return (await response.text()).slice(0, 500000);
  } catch {
    return "";
  }
};

const extractEmails = (html) => {
  if (!html) return [];

  const decoded = html
    .replace(/&#64;|\[at\]/gi, "@")
    .replace(/&#46;|\[dot\]/gi, ".");

  const matches =
    decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];

  const blocked = [
    "example.com",
    "sentry.io",
    "wixpress.com",
    "shopify.com",
    "wordpress.org",
  ];

  return [...new Set(matches.map((item) => item.toLowerCase()))]
    .filter((email) => !blocked.some((item) => email.endsWith(item)))
    .filter((email) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email))
    .slice(0, 5);
};

const findBusinessEmail = async (website) => {
  const root = rootUrl(website);
  if (!root) return "";

  const pages = [
    root,
    root + "/contact",
    root + "/contact-us",
    root + "/about",
    root + "/about-us",
  ];

  for (const page of pages) {
    const html = await fetchText(page);
    const emails = extractEmails(html);

    if (emails.length) {
      return (
        emails.find((email) =>
          /^(hello|info|contact|sales|business|support|admin)@/i.test(email)
        ) || emails[0]
      );
    }
  }

  return "";
};

const parseJsonObject = (text) => {
  const cleaned = String(text || "")
    .replace(/^\s*```json/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned);
};

const qualifyCandidate = async ({ candidate, market, service }) => {
  const openai = getOpenAI();

  const prompt = [
    "You qualify B2B prospects for PP DESIGN AND TECH, a web development agency.",
    "",
    "Target services:",
    "- Shopify development and Shopify customizations",
    "- Custom web application development",
    "- Next.js / React development",
    "- WordPress / WooCommerce development",
    "- Ecommerce redesign, CRO and maintenance",
    "",
    "Evaluate this public business prospect:",
    "Market: " + market,
    "Search intent: " + service,
    "Company/site title: " + candidate.title,
    "Website: " + candidate.website,
    "Public search snippet: " + candidate.snippet,
    "Public business email found: " + (candidate.email || "none"),
    "",
    "Return ONLY valid JSON:",
    "{",
    '  "score": 0,',
    '  "qualified": true,',
    '  "company": "best company name",',
    '  "contactName": "Company Team",',
    '  "recommendedService": "Shopify|WordPress / WooCommerce|Custom Development|UI/UX / Figma|Website Maintenance|Other",',
    '  "reason": "one concise sentence",',
    '  "researchNotes": "2-4 concise factual observations based only on supplied information"',
    "}",
    "",
    "Score 65+ only when there is a plausible commercial fit.",
    "Do not invent facts.",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: process.env.SALES_AGENT_AI_MODEL || "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  const result = parseJsonObject(completion.choices[0].message.content);
  result.score = Math.max(0, Math.min(100, Number(result.score || 0)));
  return result;
};

const findPlatform = async (recommendedService) => {
  if (!recommendedService) return null;

  const serviceMap = {
    Shopify: /shopify/i,
    "WordPress / WooCommerce": /wordpress|woocommerce/i,
    "Custom Development": /custom/i,
    "UI/UX / Figma": /ui\/ux|figma|design/i,
    "Website Maintenance": /maintenance/i,
  };

  const matcher = serviceMap[recommendedService];
  return matcher ? Platform.findOne({ name: matcher }) : null;
};

const isDuplicate = async ({ email, website }) => {
  const clauses = [];

  if (email) clauses.push({ email: email.toLowerCase() });

  const domain = domainKey(website);
  if (domain) clauses.push({ website: new RegExp(escapeRegex(domain), "i") });

  if (!clauses.length) return false;

  return Boolean(await Lead.findOne({ $or: clauses }).select("_id"));
};

const buildQueries = (markets, services, maxQueries) => {
  const rows = [];

  for (const market of markets) {
    for (const service of services) {
      rows.push({
        market,
        service,
        query:
          service +
          " businesses brands in " +
          market +
          " ecommerce website contact",
      });
    }
  }

  return rows.slice(0, maxQueries);
};

const runSalesAgent = async ({ userId, trigger = "manual" }) => {
  const config = getConfig();
  const queryRows = buildQueries(
    config.markets,
    config.services,
    config.maxQueriesPerRun
  );

  const run = await SalesAgentRun.create({
    status: "running",
    trigger,
    markets: config.markets,
    services: config.services,
    queries: queryRows.map((item) => item.query),
    createdBy: userId,
  });

  try {
    const seenDomains = new Set();

    for (const row of queryRows) {
      let results = [];

      try {
        results = await searchWeb(row.query, config.resultsPerQuery);
      } catch (error) {
        run.errors.push(row.query + ": " + error.message);
        continue;
      }

      run.found += results.length;

      for (const candidate of results) {
        const domain = domainKey(candidate.website);

        if (!domain || seenDomains.has(domain)) continue;
        seenDomains.add(domain);

        if (
          /facebook\.com|instagram\.com|linkedin\.com|youtube\.com|x\.com|twitter\.com/i.test(
            candidate.website
          )
        ) {
          continue;
        }

        candidate.email = await findBusinessEmail(candidate.website);

        if (!candidate.email) {
          run.rejected += 1;
          continue;
        }

        run.withEmail += 1;

        if (await isDuplicate(candidate)) {
          run.duplicates += 1;
          continue;
        }

        let qualification;

        try {
          qualification = await qualifyCandidate({
            candidate,
            market: row.market,
            service: row.service,
          });
        } catch (error) {
          run.errors.push(candidate.website + ": " + error.message);
          continue;
        }

        if (
          !qualification.qualified ||
          qualification.score < config.minScore
        ) {
          run.rejected += 1;
          continue;
        }

        run.qualified += 1;

        const platform = await findPlatform(
          qualification.recommendedService
        );

        await Lead.create({
          name: qualification.contactName || "Company Team",
          company: qualification.company || candidate.title,
          email: candidate.email,
          website: rootUrl(candidate.website),
          platform: platform?._id,
          owner: userId,
          source: "Email Outreach",
          stage: "New Lead",
          probability: Math.min(
            60,
            Math.max(10, Math.round(qualification.score / 2))
          ),
          notes: [
            "Sales Agent score: " + qualification.score + "/100",
            "Market: " + row.market,
            "Recommended service: " +
              (qualification.recommendedService || row.service),
            "Reason: " + (qualification.reason || ""),
            "Research: " +
              (qualification.researchNotes || candidate.snippet || ""),
            "Source: " + (candidate.sourceUrl || candidate.website),
          ]
            .filter(Boolean)
            .join("\n"),
          createdBy: userId,
        });

        run.inserted += 1;
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

module.exports = {
  getConfig,
  runSalesAgent,
};
