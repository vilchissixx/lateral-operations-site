const crypto = require("crypto");

const json = (response, statusCode, body) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

const readBody = (request) => new Promise((resolve, reject) => {
  let body = "";

  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 10000) {
      reject(new Error("Request body too large."));
    }
  });

  request.on("end", () => resolve(body));
  request.on("error", reject);
});

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const parseTags = (value) => String(value || "")
  .split(",")
  .map((tag) => tag.trim())
  .filter(Boolean);

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Use POST to join the newsletter." });
  }

  let payload;

  try {
    payload = JSON.parse(await readBody(request));
  } catch (error) {
    return json(response, 400, { error: "Please submit the form again." });
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const firstName = String(payload.firstName || "").trim().slice(0, 80);
  const consent = payload.consent === true;
  const honeypot = String(payload.website || "").trim();
  const startedAt = Number(payload.formStartedAt || 0);
  const elapsedMs = Date.now() - startedAt;

  if (honeypot || !Number.isFinite(elapsedMs) || elapsedMs < 1200) {
    return json(response, 400, { error: "Please submit the form again." });
  }

  if (!isValidEmail(email)) {
    return json(response, 400, { error: "Please enter a valid email address." });
  }

  if (!consent) {
    return json(response, 400, { error: "Consent is required to join the newsletter." });
  }

  if (process.env.NEWSLETTER_PROVIDER !== "mailchimp") {
    return json(response, 503, { error: "Newsletter signup is not configured yet." });
  }

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;

  if (!apiKey || !serverPrefix || !audienceId) {
    return json(response, 503, { error: "Newsletter signup is not configured yet." });
  }

  const subscriberHash = crypto.createHash("md5").update(email).digest("hex");
  const endpoint = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`;
  const doubleOptIn = process.env.NEWSLETTER_DOUBLE_OPT_IN !== "false";
  const tags = parseTags(process.env.MAILCHIMP_TAGS);

  try {
    const providerResponse = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Authorization": `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email_address: email,
        status_if_new: doubleOptIn ? "pending" : "subscribed",
        merge_fields: firstName ? { FNAME: firstName } : {},
        tags: tags
      })
    });

    if (!providerResponse.ok) {
      let providerPayload = {};
      try {
        providerPayload = await providerResponse.json();
      } catch (error) {
        providerPayload = {};
      }

      console.error("Newsletter provider error", {
        status: providerResponse.status,
        title: providerPayload.title,
        type: providerPayload.type
      });

      return json(response, 502, { error: "The newsletter provider could not accept the signup. Please try again later." });
    }

    return json(response, 200, {
      message: doubleOptIn
        ? "Almost there. Please check your inbox to confirm the subscription."
        : "You're on the list. Thanks for joining."
    });
  } catch (error) {
    console.error("Newsletter request failed", { message: error.message });
    return json(response, 502, { error: "The newsletter provider could not accept the signup. Please try again later." });
  }
};
