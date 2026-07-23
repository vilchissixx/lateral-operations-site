const crypto = require("crypto");

const MAX_BODY_LENGTH = 60000;
const RATE_LIMIT_WINDOW_MS = Number(process.env.ROLE_BLUEPRINT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.ROLE_BLUEPRINT_RATE_LIMIT_MAX || 8);
const submissionsByIp = new Map();

const FIELD_LIMITS = {
  jobTitle: 140,
  jobDescription: 12000,
  businessObjective: 1200,
  responsibilities: 3000,
  requiredExperience: 2500,
  toolsKnowledge: 1600,
  workSchedule: 600,
  timezoneOverlap: 600,
  candidateRegions: 800,
  employmentType: 300,
  compensationBudget: 400,
  idealStartDate: 300,
  firstName: 80,
  businessEmail: 160,
  companyName: 140,
  companyWebsite: 220,
  phone: 60
};

const REQUIRED_ROLE_FIELDS = [
  "jobTitle",
  "jobDescription",
  "businessObjective",
  "responsibilities",
  "requiredExperience",
  "workSchedule",
  "timezoneOverlap",
  "candidateRegions",
  "employmentType",
  "compensationBudget",
  "idealStartDate"
];

const REQUIRED_LEAD_FIELDS = [
  "firstName",
  "businessEmail",
  "companyName"
];

const CATEGORY_RULES = [
  { name: "Sales and revenue support", words: ["sales", "sdr", "bdr", "pipeline", "prospecting", "revenue", "quote", "closing"] },
  { name: "Customer success and client delivery", words: ["customer success", "client success", "onboarding", "renewal", "retention", "implementation", "client"] },
  { name: "Support and intake", words: ["support", "ticket", "inbound", "intake", "triage", "phone", "chat", "case", "queue"] },
  { name: "Operations and administration", words: ["operations", "admin", "administrative", "process", "workflow", "documentation", "scheduling", "coordination"] },
  { name: "Project coordination", words: ["project", "milestone", "timeline", "stakeholder", "delivery"] },
  { name: "Recruiting and people operations", words: ["recruiting", "recruiter", "talent acquisition", "candidate", "interview", "hiring"] },
  { name: "Legal or compliance support", words: ["legal", "paralegal", "compliance", "contract", "case file", "regulatory"] },
  { name: "Finance or revenue cycle", words: ["billing", "invoice", "collections", "payment", "claims", "revenue cycle", "bookkeeping"] },
  { name: "Technical systems coordination", words: ["api", "sql", "automation", "systems", "saas", "integration"] }
];

const CONFLICT_RULES = [
  { label: "Sales ownership and support queue ownership may compete for attention.", words: ["sales", "pipeline", "support", "ticket"] },
  { label: "Strategic ownership and heavy administrative execution should be separated or prioritized.", words: ["strategy", "admin"] },
  { label: "Customer success, project delivery, and recruiting responsibilities may be too broad for one role.", words: ["customer success", "project", "recruit"] },
  { label: "Technical systems work and high-volume client communication may require different screening paths.", words: ["api", "automation", "client", "customer"] },
  { label: "Leadership expectations and entry-level execution are mixed together.", words: ["team lead", "people manager", "entry-level", "junior"] }
];

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
    if (body.length > MAX_BODY_LENGTH) {
      reject(new Error("Request body too large."));
    }
  });

  request.on("end", () => resolve(body));
  request.on("error", reject);
});

const normalizeText = (value, limit) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, limit);

const normalizeEmail = (value) => normalizeText(value, FIELD_LIMITS.businessEmail).toLowerCase();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isBusinessEmail = (email) => {
  const domain = email.split("@")[1] || "";
  return !/^(gmail|yahoo|hotmail|outlook|icloud|aol|protonmail)\./i.test(domain);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchesWord = (text, word) => {
  if (word.includes(" ")) {
    return text.includes(word);
  }

  return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(text);
};

const includesAny = (text, words) => words.some((word) => matchesWord(text, word));

const splitList = (text) => normalizeText(text, 3000)
  .split(/[\n;,]+|\s-\s/)
  .map((item) => item.trim())
  .filter(Boolean)
  .slice(0, 8);

const sentence = (value, fallback) => {
  const clean = normalizeText(value, 500);
  if (!clean) return fallback;
  return clean.endsWith(".") ? clean : `${clean}.`;
};

const analyzeRole = (role) => {
  const combined = Object.values(role).join(" ").toLowerCase();
  const categories = CATEGORY_RULES
    .filter((rule) => includesAny(combined, rule.words))
    .map((rule) => rule.name);

  const conflicts = CONFLICT_RULES
    .filter((rule) => rule.words.every((word) => matchesWord(combined, word)))
    .map((rule) => rule.label);

  const missing = REQUIRED_ROLE_FIELDS
    .filter((field) => !role[field])
    .map((field) => ({
      jobTitle: "job title",
      jobDescription: "full job description",
      businessObjective: "primary business objective",
      responsibilities: "main responsibilities",
      requiredExperience: "required experience",
      workSchedule: "work schedule",
      timezoneOverlap: "required time-zone overlap",
      candidateRegions: "candidate countries or regions",
      employmentType: "employment type",
      compensationBudget: "approximate compensation budget",
      idealStartDate: "ideal start date"
    }[field]));

  const difficulty = [];
  if (role.jobDescription.length < 350) difficulty.push("The job description is short, so the screening criteria may need more detail.");
  if (categories.length > 4) difficulty.push("The role spans several responsibility categories, which can make sourcing and interviews less focused.");
  if (/flexible|any|tbd|open|varies/i.test(role.workSchedule + " " + role.timezoneOverlap)) difficulty.push("The schedule or overlap requirement is broad and should be clarified before sourcing.");
  if (/competitive|tbd|negotiable|depends/i.test(role.compensationBudget)) difficulty.push("The compensation budget is not specific enough to qualify candidates efficiently.");
  if (splitList(role.toolsKnowledge).length > 5) difficulty.push("The tool or industry requirement list may narrow the talent pool.");
  if (/asap|immediate|urgent/i.test(role.idealStartDate)) difficulty.push("The start date appears urgent, so screening speed and candidate availability matter.");

  const vagueWords = (combined.match(/\b(flexible|dynamic|fast-paced|rockstar|wear many hats|self-starter|as needed)\b/g) || []).length;
  let score = 100;
  score -= missing.length * 7;
  score -= conflicts.length * 8;
  score -= difficulty.length * 5;
  score -= vagueWords * 3;
  if (role.jobDescription.length < 350) score -= 10;
  if (categories.length === 0) score -= 12;
  score = Math.max(0, Math.min(100, score));

  const recommendations = [
    missing.length
      ? `Clarify the missing items first: ${missing.slice(0, 3).join(", ")}.`
      : "Turn the strongest responsibilities into a short scorecard before sourcing.",
    conflicts.length
      ? "Separate must-own responsibilities from occasional support work so candidates are screened against the real job."
      : "Define the three outcomes this person should own in the first 90 days.",
    difficulty.length
      ? "Resolve the difficulty indicators before outreach so candidate conversations stay practical."
      : "Use structured screening questions to compare candidates consistently."
  ];

  return {
    score,
    scoreExplanation: "This is a practical clarity estimate based on completeness, focus, conflicts, and hiring friction. It is not scientific, predictive, guaranteed, or legal guidance.",
    categories: categories.length ? categories : ["General operations or support"],
    conflicts: conflicts.length ? conflicts : ["No major responsibility conflict detected from the submitted text."],
    missing: missing.length ? missing : ["No major required information gaps detected."],
    difficulty: difficulty.length ? difficulty : ["No major hiring difficulty indicators detected from the submitted text."],
    recommendations
  };
};

const buildBlueprint = (role, diagnosis) => {
  const responsibilities = splitList(role.responsibilities);
  const experience = splitList(role.requiredExperience);
  const tools = splitList(role.toolsKnowledge);
  const primaryCategory = diagnosis.categories[0] || "Role execution";
  const outcome = sentence(role.businessObjective, "The primary outcome should be clarified before sourcing.");

  return {
    roleSummary: `${role.jobTitle} for ${primaryCategory.toLowerCase()}, focused on ${outcome}`,
    primaryOutcome: outcome,
    mustHaveQualifications: [
      ...experience.slice(0, 4),
      role.workSchedule ? `Can reliably work the stated schedule: ${role.workSchedule}` : "",
      role.timezoneOverlap ? `Can cover the required time-zone overlap: ${role.timezoneOverlap}` : ""
    ].filter(Boolean),
    niceToHaveQualifications: [
      ...tools.slice(0, 4),
      role.candidateRegions ? `Experience working with teams or clients across ${role.candidateRegions}` : "",
      "Comfort documenting work clearly in a remote environment"
    ].filter(Boolean),
    responsibilityBoundaries: [
      responsibilities.length ? `Core work: ${responsibilities.slice(0, 5).join("; ")}.` : "Core responsibilities need clearer definition.",
      diagnosis.conflicts[0],
      "Keep ownership, support work, and occasional overflow tasks visibly separated in the scorecard."
    ],
    candidateScorecard: [
      { criterion: "Outcome ownership", weight: "High", evidence: "Can explain how they have owned similar outcomes without needing constant direction." },
      { criterion: "Relevant role experience", weight: "High", evidence: experience[0] || "Has experience close to the submitted must-have requirements." },
      { criterion: "Tools and industry context", weight: "Medium", evidence: tools[0] || "Can ramp into the required systems and industry context." },
      { criterion: "Communication quality", weight: "High", evidence: "Writes and speaks clearly, asks precise questions, and confirms next steps." },
      { criterion: "Remote operating habits", weight: "Medium", evidence: "Can manage handoffs, time-zone overlap, and documentation without hidden follow-up." }
    ],
    screeningQuestions: [
      `What part of your background is closest to this ${role.jobTitle} role?`,
      `Tell me about a recent role where you owned: ${responsibilities[0] || "a similar responsibility"}.`,
      `Which tools or workflows from this role have you used directly: ${tools.slice(0, 3).join(", ") || "the required systems"}?`,
      `What schedule and time-zone overlap can you reliably commit to?`,
      "What would you need clarified before accepting this role?"
    ],
    structuredInterviewQuestions: [
      `How would you approach the first two weeks in this ${role.jobTitle} role?`,
      `Walk through how you would deliver the primary outcome: ${outcome}`,
      "Describe a time you had to manage competing priorities across support, operations, clients, or internal stakeholders.",
      "How do you document work so a remote team can trust the handoff?",
      "What would make this role hard to perform well?"
    ],
    strongAnswerIndicators: [
      "Connects past work to the actual responsibilities instead of speaking only in general traits.",
      "Names tradeoffs, handoffs, and communication rhythms.",
      "Can describe measurable outputs without inventing certainty.",
      "Asks practical questions about tools, schedule, priorities, and decision rights."
    ],
    redFlags: [
      "Cannot explain relevant examples from prior work.",
      "Treats unclear responsibilities as no problem instead of asking clarifying questions.",
      "Needs a schedule, compensation, or work arrangement that conflicts with the submitted requirements.",
      "Overstates tool knowledge without practical examples."
    ],
    outcomes30: [
      "Understand the role scorecard, tools, stakeholders, and handoff expectations.",
      `Own a first set of recurring responsibilities tied to ${primaryCategory.toLowerCase()}.`,
      "Document questions, blockers, and early process improvements."
    ],
    outcomes60: [
      "Handle the core workflow with fewer corrections and clearer prioritization.",
      "Improve response quality, follow-through, or operating rhythm in the role's main workstream.",
      "Identify repeatable patterns that can be documented or delegated."
    ],
    outcomes90: [
      "Own the role's primary outcome with a reliable weekly operating cadence.",
      "Reduce avoidable manager follow-up by making status, blockers, and next steps visible.",
      "Contribute practical improvements to the process without drifting away from the role's core purpose."
    ],
    sourcingConsiderations: [
      `Prioritize candidates with evidence in ${diagnosis.categories.slice(0, 3).join(", ").toLowerCase()}.`,
      role.candidateRegions ? `Search within the approved candidate regions: ${role.candidateRegions}.` : "Define allowed candidate regions before sourcing.",
      "Screen for communication habits and remote handoff discipline early, not at the final interview."
    ],
    scheduleConsiderations: [
      role.workSchedule ? `Work schedule: ${role.workSchedule}.` : "Work schedule should be defined before outreach.",
      role.timezoneOverlap ? `Time-zone overlap: ${role.timezoneOverlap}.` : "Required overlap should be made explicit.",
      "If overlap is limited, define which meetings, handoffs, or client windows are non-negotiable."
    ],
    hiringRisks: [
      ...diagnosis.difficulty.slice(0, 3),
      ...diagnosis.conflicts.filter((item) => !item.startsWith("No major")).slice(0, 2)
    ],
    recommendedNextStep: "Use this blueprint to tighten the role intake, then source and screen candidates against the scorecard instead of reviewing resumes in bulk."
  };
};

const reportToText = (role, lead, diagnosis, blueprint) => {
  const lines = [
    "Lateral Operations Role Blueprint",
    "",
    `Submission for: ${lead.companyName}`,
    `Role: ${role.jobTitle}`,
    `Role Clarity Score: ${diagnosis.score}/100`,
    diagnosis.scoreExplanation,
    "",
    "1. Role summary",
    blueprint.roleSummary,
    "",
    "2. Primary outcome of the position",
    blueprint.primaryOutcome,
    "",
    "3. Must-have qualifications",
    ...blueprint.mustHaveQualifications.map((item) => `- ${item}`),
    "",
    "4. Nice-to-have qualifications",
    ...blueprint.niceToHaveQualifications.map((item) => `- ${item}`),
    "",
    "5. Responsibility boundaries",
    ...blueprint.responsibilityBoundaries.map((item) => `- ${item}`),
    "",
    "6. Candidate scorecard",
    ...blueprint.candidateScorecard.map((item) => `- ${item.criterion} (${item.weight}): ${item.evidence}`),
    "",
    "7. Screening questions",
    ...blueprint.screeningQuestions.map((item) => `- ${item}`),
    "",
    "8. Structured interview questions",
    ...blueprint.structuredInterviewQuestions.map((item) => `- ${item}`),
    "",
    "9. Strong-answer indicators",
    ...blueprint.strongAnswerIndicators.map((item) => `- ${item}`),
    "",
    "10. Red flags",
    ...blueprint.redFlags.map((item) => `- ${item}`),
    "",
    "11. Suggested 30-day outcomes",
    ...blueprint.outcomes30.map((item) => `- ${item}`),
    "",
    "12. Suggested 60-day outcomes",
    ...blueprint.outcomes60.map((item) => `- ${item}`),
    "",
    "13. Suggested 90-day outcomes",
    ...blueprint.outcomes90.map((item) => `- ${item}`),
    "",
    "14. Recommended sourcing considerations",
    ...blueprint.sourcingConsiderations.map((item) => `- ${item}`),
    "",
    "15. Time-zone and schedule considerations",
    ...blueprint.scheduleConsiderations.map((item) => `- ${item}`),
    "",
    "16. Potential hiring risks",
    ...blueprint.hiringRisks.map((item) => `- ${item}`),
    "",
    "17. Recommended next step",
    blueprint.recommendedNextStep,
    "",
    "Ready to turn this blueprint into a focused shortlist?",
    "Lateral Operations can personally source and screen candidates against this role through a founder-led Talent Sprint."
  ];

  return lines.join("\n");
};

const validateRateLimit = (request) => {
  const forwarded = String(request.headers["x-forwarded-for"] || "");
  const ip = forwarded.split(",")[0].trim() || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const timestamps = (submissionsByIp.get(ip) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  submissionsByIp.set(ip, timestamps);
  return timestamps.length <= RATE_LIMIT_MAX;
};

const safeUrl = (value) => {
  const clean = normalizeText(value, FIELD_LIMITS.companyWebsite);
  if (!clean) return "";
  try {
    const url = new URL(clean.startsWith("http") ? clean : `https://${clean}`);
    return ["http:", "https:"].includes(url.protocol) ? url.toString().slice(0, FIELD_LIMITS.companyWebsite) : "";
  } catch (error) {
    return "";
  }
};

const callWebhook = async (payload) => {
  if (process.env.ROLE_BLUEPRINT_PROVIDER !== "webhook") {
    return {
      configured: false,
      saved: false,
      emailed: false,
      duplicate: false,
      message: "Role Blueprint storage and email delivery are not configured yet."
    };
  }

  const webhookUrl = process.env.ROLE_BLUEPRINT_WEBHOOK_URL;
  const webhookSecret = process.env.ROLE_BLUEPRINT_WEBHOOK_SECRET;

  if (!webhookUrl || !webhookSecret) {
    return {
      configured: false,
      saved: false,
      emailed: false,
      duplicate: false,
      message: "Role Blueprint storage and email delivery are not configured yet."
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      webhookSecret,
      ...payload
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      configured: true,
      saved: false,
      emailed: false,
      duplicate: false,
      message: data.error || "The Role Blueprint webhook could not process the submission."
    };
  }

  return {
    configured: true,
    saved: data.saved === true,
    emailed: data.emailed === true,
    duplicate: data.duplicate === true,
    message: data.message || data.error || "Role Blueprint webhook processed the submission."
  };
};

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Use POST to generate a Role Blueprint." });
  }

  if (!validateRateLimit(request)) {
    return json(response, 429, { error: "Too many submissions. Please wait a few minutes and try again." });
  }

  let payload;

  try {
    payload = JSON.parse(await readBody(request));
  } catch (error) {
    return json(response, 400, { error: "Please submit the Role Blueprint form again." });
  }

  const honeypot = normalizeText(payload.website, 120);
  const startedAt = Number(payload.formStartedAt || 0);
  const elapsedMs = Date.now() - startedAt;

  if (honeypot || !Number.isFinite(elapsedMs) || elapsedMs < 1500) {
    return json(response, 400, { error: "Please submit the Role Blueprint form again." });
  }

  const role = {};
  Object.keys(FIELD_LIMITS).forEach((field) => {
    if (!["firstName", "businessEmail", "companyName", "companyWebsite", "phone"].includes(field)) {
      role[field] = normalizeText(payload.role && payload.role[field], FIELD_LIMITS[field]);
    }
  });

  const lead = {
    firstName: normalizeText(payload.lead && payload.lead.firstName, FIELD_LIMITS.firstName),
    businessEmail: normalizeEmail(payload.lead && payload.lead.businessEmail),
    companyName: normalizeText(payload.lead && payload.lead.companyName, FIELD_LIMITS.companyName),
    companyWebsite: safeUrl(payload.lead && payload.lead.companyWebsite),
    phone: normalizeText(payload.lead && payload.lead.phone, FIELD_LIMITS.phone),
    consent: payload.lead && payload.lead.consent === true,
    newsletterConsent: payload.lead && payload.lead.newsletterConsent === true
  };

  const missingRole = REQUIRED_ROLE_FIELDS.filter((field) => !role[field]);
  const missingLead = REQUIRED_LEAD_FIELDS.filter((field) => !lead[field]);

  if (missingRole.length || missingLead.length) {
    return json(response, 400, {
      error: "Please complete the required Role Blueprint fields.",
      missingRole,
      missingLead
    });
  }

  if (!isValidEmail(lead.businessEmail)) {
    return json(response, 400, { error: "Please enter a valid business email address." });
  }

  if (!isBusinessEmail(lead.businessEmail)) {
    return json(response, 400, { error: "Please use a business email address for the Role Blueprint." });
  }

  if (!lead.consent) {
    return json(response, 400, { error: "Consent is required to receive the Role Blueprint and related follow-up." });
  }

  const submissionId = `rbp_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  const timestamp = new Date().toISOString();
  const consentTimestamp = normalizeText(payload.consentTimestamp, 80) || timestamp;
  const diagnosis = analyzeRole(role);
  const blueprint = buildBlueprint(role, diagnosis);
  const reportText = reportToText(role, lead, diagnosis, blueprint);
  const normalizedDuplicateKey = [
    lead.businessEmail,
    lead.companyName.toLowerCase(),
    role.jobTitle.toLowerCase()
  ].join("|");

  const utm = {
    source: normalizeText(payload.utm && payload.utm.source, 120),
    medium: normalizeText(payload.utm && payload.utm.medium, 120),
    campaign: normalizeText(payload.utm && payload.utm.campaign, 120)
  };

  let webhookResult;
  try {
    webhookResult = await callWebhook({
      submissionId,
      submissionTimestamp: timestamp,
      consentTimestamp,
      leadSource: "Role Blueprint - Website",
      followUpStatus: "New",
      normalizedDuplicateKey,
      lead,
      role,
      diagnosis,
      blueprint,
      reportText,
      utm
    });
  } catch (error) {
    console.error("Role Blueprint webhook failed", { message: error.message });
    webhookResult = {
      configured: true,
      saved: false,
      emailed: false,
      duplicate: false,
      message: "The report was generated, but storage or email delivery failed."
    };
  }

  return json(response, 200, {
    submissionId,
    generated: true,
    saved: webhookResult.saved,
    emailed: webhookResult.emailed,
    duplicate: webhookResult.duplicate,
    message: webhookResult.message,
    diagnosis,
    blueprint,
    reportText
  });
};
