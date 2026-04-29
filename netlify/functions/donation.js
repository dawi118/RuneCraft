const DEFAULT_DONATION_URL = "https://gofund.me/7dc3fc541";

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return respond(204, "");
  }

  if (event.httpMethod !== "GET") {
    return respond(405, { error: "Method not allowed" }, { Allow: "GET, OPTIONS" });
  }

  try {
    const donation = await readDonationProgress();
    return respond(200, donation);
  } catch (error) {
    return respond(Number(error.statusCode || 502), { error: error.message || "Could not read donation progress" });
  }
};

async function readDonationProgress() {
  const url = process.env.GOFUNDME_URL || DEFAULT_DONATION_URL;
  const response = await fetch(url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "project-runecraft-donation-progress"
    }
  });

  if (!response.ok) {
    throw httpError(response.status, `GoFundMe returned ${response.status}`);
  }

  const html = await response.text();
  const fundraiser = parseFundraiserState(html);
  const currentAmount = money(fundraiser.currentAmount);
  const goalAmount = money(fundraiser.goalAmount || fundraiser.userDefinedGoalAmount);
  const raised = currentAmount.amount;
  const goal = goalAmount.amount;
  const currencyCode = currentAmount.currencyCode || goalAmount.currencyCode || "GBP";

  if (!Number.isFinite(raised) || !Number.isFinite(goal) || goal <= 0) {
    throw httpError(502, "GoFundMe did not include readable donation totals");
  }

  return {
    raised,
    goal,
    currencyCode,
    url: response.url || url,
    updatedAt: new Date().toISOString()
  };
}

function parseFundraiserState(html) {
  const nextData = String(html || "").match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    const data = JSON.parse(nextData[1]);
    const state = data?.props?.pageProps?.__APOLLO_STATE__ || {};
    const fundraiserKey = Object.keys(state).find((key) => key.startsWith("Fundraiser:"));
    if (fundraiserKey && state[fundraiserKey]) return state[fundraiserKey];
  }

  const currentAmount = moneyFromHtml(html, "currentAmount");
  const goalAmount = moneyFromHtml(html, "goalAmount") || moneyFromHtml(html, "userDefinedGoalAmount");
  if (currentAmount && goalAmount) return { currentAmount, goalAmount };

  throw httpError(502, "Could not find GoFundMe fundraiser totals");
}

function money(value) {
  return {
    amount: Number(value?.amount),
    currencyCode: String(value?.currencyCode || "").trim().toUpperCase()
  };
}

function moneyFromHtml(html, fieldName) {
  const field = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html || "").match(new RegExp(`"${field}"\\s*:\\s*\\{[^}]*"amount"\\s*:\\s*(\\d+(?:\\.\\d+)?)[^}]*"currencyCode"\\s*:\\s*"([A-Z]{3})"`, "i"));
  if (!match) return null;

  return {
    amount: Number(match[1]),
    currencyCode: match[2]
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function respond(statusCode, body, extraHeaders = {}) {
  const isText = typeof body === "string";
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Origin": process.env.PUBLIC_ALLOWED_ORIGIN || "*",
      "Cache-Control": statusCode === 200 ? "public, max-age=300, stale-while-revalidate=3600" : "no-store",
      "Content-Type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
      ...extraHeaders
    },
    body: isText ? body : JSON.stringify(body)
  };
}
