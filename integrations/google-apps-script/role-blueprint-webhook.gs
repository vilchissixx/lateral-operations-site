var HEADERS = [
  "Submission ID",
  "Submission timestamp",
  "First name",
  "Business email",
  "Company",
  "Company website",
  "Optional phone",
  "Job title",
  "Full job description",
  "Primary business objective",
  "Responsibilities",
  "Required experience",
  "Tools or industry knowledge",
  "Schedule",
  "Time-zone overlap",
  "Candidate regions",
  "Employment type",
  "Compensation budget",
  "Ideal start date",
  "Role Clarity Score",
  "Responsibility categories",
  "Conflicting responsibilities",
  "Missing information",
  "Hiring difficulty indicators",
  "Recommendations",
  "Full Role Blueprint",
  "Consent timestamp",
  "Lead source",
  "UTM source",
  "UTM medium",
  "UTM campaign",
  "Follow-up status",
  "Duplicate key"
];

function doPost(e) {
  var result = {
    saved: false,
    emailed: false,
    duplicate: false,
    message: ""
  };

  try {
    var payload = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : "{}");
    verifySecret_(payload.webhookSecret);
    delete payload.webhookSecret;

    validatePayload_(payload);

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var duplicate = appendSubmission_(payload);
      result.saved = true;
      result.duplicate = duplicate;
    } finally {
      lock.releaseLock();
    }

    result.emailed = sendEmails_(payload, result.duplicate);
    result.message = result.duplicate
      ? "Likely duplicate detected and stored for review. Email delivery status returned separately."
      : "Role Blueprint stored. Email delivery status returned separately.";

    return json_(200, result);
  } catch (error) {
    result.message = error.message || "Role Blueprint webhook failed.";
    return json_(500, {
      saved: result.saved,
      emailed: result.emailed,
      duplicate: result.duplicate,
      error: result.message
    });
  }
}

function doGet() {
  return json_(200, {
    ok: true,
    service: "Lateral Operations Role Blueprint webhook"
  });
}

function verifySecret_(incomingSecret) {
  var expected = PropertiesService.getScriptProperties().getProperty("ROLE_BLUEPRINT_WEBHOOK_SECRET");
  if (!expected || !incomingSecret || incomingSecret !== expected) {
    throw new Error("Unauthorized Role Blueprint webhook request.");
  }
}

function validatePayload_(payload) {
  if (!payload.submissionId || !payload.lead || !payload.role || !payload.diagnosis || !payload.blueprint || !payload.reportText) {
    throw new Error("Missing required Role Blueprint payload fields.");
  }

  if (!payload.lead.businessEmail || !payload.lead.consent) {
    throw new Error("Missing business email or consent.");
  }
}

function appendSubmission_(payload) {
  var sheet = getSheet_();
  ensureHeaders_(sheet);
  var duplicate = isDuplicate_(sheet, payload.normalizedDuplicateKey);
  var followUpStatus = duplicate ? "Likely duplicate - review previous submission" : (payload.followUpStatus || "New");

  sheet.appendRow([
    payload.submissionId,
    payload.submissionTimestamp,
    value_(payload.lead.firstName),
    value_(payload.lead.businessEmail),
    value_(payload.lead.companyName),
    value_(payload.lead.companyWebsite),
    value_(payload.lead.phone),
    value_(payload.role.jobTitle),
    value_(payload.role.jobDescription),
    value_(payload.role.businessObjective),
    value_(payload.role.responsibilities),
    value_(payload.role.requiredExperience),
    value_(payload.role.toolsKnowledge),
    value_(payload.role.workSchedule),
    value_(payload.role.timezoneOverlap),
    value_(payload.role.candidateRegions),
    value_(payload.role.employmentType),
    value_(payload.role.compensationBudget),
    value_(payload.role.idealStartDate),
    payload.diagnosis.score,
    join_(payload.diagnosis.categories),
    join_(payload.diagnosis.conflicts),
    join_(payload.diagnosis.missing),
    join_(payload.diagnosis.difficulty),
    join_(payload.diagnosis.recommendations),
    value_(payload.reportText),
    value_(payload.consentTimestamp),
    value_(payload.leadSource),
    value_(payload.utm && payload.utm.source),
    value_(payload.utm && payload.utm.medium),
    value_(payload.utm && payload.utm.campaign),
    followUpStatus,
    value_(payload.normalizedDuplicateKey)
  ]);

  return duplicate;
}

function getSheet_() {
  var sheetId = PropertiesService.getScriptProperties().getProperty("ROLE_BLUEPRINT_SHEET_ID");
  if (!sheetId) {
    throw new Error("ROLE_BLUEPRINT_SHEET_ID is not configured in Script Properties.");
  }

  var spreadsheet = SpreadsheetApp.openById(sheetId);
  return spreadsheet.getSheets()[0];
}

function ensureHeaders_(sheet) {
  var existing = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var hasHeaders = existing.some(function (cell) {
    return String(cell || "").trim() !== "";
  });

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function isDuplicate_(sheet, key) {
  if (!key || sheet.getLastRow() < 2) return false;

  var duplicateColumn = HEADERS.indexOf("Duplicate key") + 1;
  var values = sheet.getRange(2, duplicateColumn, sheet.getLastRow() - 1, 1).getValues();
  return values.some(function (row) {
    return String(row[0] || "") === key;
  });
}

function sendEmails_(payload, duplicate) {
  var notifyEmail = PropertiesService.getScriptProperties().getProperty("ROLE_BLUEPRINT_NOTIFY_EMAIL") || "alberto@lateraloperations.com";
  var replyTo = PropertiesService.getScriptProperties().getProperty("ROLE_BLUEPRINT_REPLY_TO_EMAIL") || notifyEmail;
  var subject = "Your Lateral Operations Role Blueprint";
  var leadSubject = "New Role Blueprint lead: " + value_(payload.lead.companyName) + " - " + value_(payload.role.jobTitle);
  var reportBody = [
    "Your requested Lateral Operations Role Blueprint is below.",
    "",
    payload.reportText,
    "",
    "To discuss this hiring need with Alberto, use the booking link:",
    "https://calendar.app.google/tW24dFbjDKWzCcVLA"
  ].join("\n");
  var notificationBody = [
    "New Role Blueprint submission received.",
    "",
    "Submission ID: " + payload.submissionId,
    "Duplicate: " + (duplicate ? "Yes" : "No"),
    "First name: " + value_(payload.lead.firstName),
    "Business email: " + value_(payload.lead.businessEmail),
    "Company: " + value_(payload.lead.companyName),
    "Company website: " + value_(payload.lead.companyWebsite),
    "Phone provided: " + (payload.lead.phone ? "Yes" : "No"),
    "Job title: " + value_(payload.role.jobTitle),
    "Role Clarity Score: " + payload.diagnosis.score,
    "",
    "Open the dedicated Role Blueprint Google Sheet for the full submission."
  ].join("\n");

  MailApp.sendEmail({
    to: payload.lead.businessEmail,
    subject: subject,
    body: reportBody,
    replyTo: replyTo,
    name: "Lateral Operations"
  });

  MailApp.sendEmail({
    to: notifyEmail,
    subject: leadSubject,
    body: notificationBody,
    replyTo: replyTo,
    name: "Lateral Operations"
  });

  return true;
}

function json_(statusCode, body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function join_(items) {
  return Array.isArray(items) ? items.join("\n") : value_(items);
}

function value_(item) {
  return String(item || "");
}
