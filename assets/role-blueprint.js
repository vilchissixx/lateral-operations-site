(function () {
  var form = document.querySelector("[data-role-blueprint-form]");
  if (!form) return;

  var state = {
    role: {},
    diagnosis: null,
    blueprint: null,
    reportText: "",
    submitted: false
  };

  var steps = Array.prototype.slice.call(document.querySelectorAll("[data-blueprint-step]"));
  var progressItems = Array.prototype.slice.call(document.querySelectorAll("[data-step-indicator]"));
  var diagnosisPanel = document.querySelector("[data-diagnosis-panel]");
  var reportPanel = document.querySelector("[data-report-panel]");
  var submitButton = document.querySelector("[data-submit-blueprint]");
  var formMessage = document.querySelector("[data-blueprint-message]");
  var copyButton = document.querySelector("[data-copy-report]");
  var printButton = document.querySelector("[data-print-report]");
  var startedAtInput = form.querySelector("[name='formStartedAt']");
  var consentTimestampInput = form.querySelector("[name='consentTimestamp']");
  var newsletterMessage = document.querySelector("[data-newsletter-status]");

  var categoryRules = [
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

  var conflictRules = [
    { label: "Sales ownership and support queue ownership may compete for attention.", words: ["sales", "pipeline", "support", "ticket"] },
    { label: "Strategic ownership and heavy administrative execution should be separated or prioritized.", words: ["strategy", "admin"] },
    { label: "Customer success, project delivery, and recruiting responsibilities may be too broad for one role.", words: ["customer success", "project", "recruit"] },
    { label: "Technical systems work and high-volume client communication may require different screening paths.", words: ["api", "automation", "client", "customer"] },
    { label: "Leadership expectations and entry-level execution are mixed together.", words: ["team lead", "people manager", "entry-level", "junior"] }
  ];

  var roleFields = [
    "jobTitle",
    "jobDescription",
    "businessObjective",
    "responsibilities",
    "requiredExperience",
    "toolsKnowledge",
    "workSchedule",
    "timezoneOverlap",
    "candidateRegions",
    "employmentType",
    "compensationBudget",
    "idealStartDate"
  ];

  function setStep(stepName) {
    steps.forEach(function (step) {
      step.hidden = step.getAttribute("data-blueprint-step") !== stepName;
    });

    progressItems.forEach(function (item) {
      item.classList.toggle("is-active", item.getAttribute("data-step-indicator") === stepName);
    });

    var active = document.querySelector("[data-blueprint-step='" + stepName + "']");
    if (active) {
      var heading = active.querySelector("h2, h1");
      if (heading) heading.focus({ preventScroll: true });
      active.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getValue(name) {
    var field = form.elements[name];
    return field ? clean(field.value) : "";
  }

  function includesAny(text, words) {
    return words.some(function (word) {
      return matchesWord(text, word);
    });
  }

  function matchesWord(text, word) {
    if (word.indexOf(" ") !== -1) {
      return text.indexOf(word) !== -1;
    }

    return new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(text);
  }

  function splitList(text) {
    return clean(text)
      .split(/[\n;,]+|\s-\s/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean)
      .slice(0, 8);
  }

  function sentence(value, fallback) {
    var text = clean(value);
    if (!text) return fallback;
    return /[.!?]$/.test(text) ? text : text + ".";
  }

  function collectRole() {
    var role = {};
    roleFields.forEach(function (field) {
      role[field] = getValue(field);
    });
    return role;
  }

  function missingRoleFields(role) {
    var labels = {
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
    };

    return Object.keys(labels).filter(function (field) {
      return !role[field];
    }).map(function (field) {
      return labels[field];
    });
  }

  function analyzeRole(role) {
    var combined = Object.keys(role).map(function (key) { return role[key]; }).join(" ").toLowerCase();
    var categories = categoryRules.filter(function (rule) {
      return includesAny(combined, rule.words);
    }).map(function (rule) {
      return rule.name;
    });

    var conflicts = conflictRules.filter(function (rule) {
      return rule.words.every(function (word) {
        return matchesWord(combined, word);
      });
    }).map(function (rule) {
      return rule.label;
    });

    var missing = missingRoleFields(role);
    var difficulty = [];
    if (role.jobDescription.length < 350) difficulty.push("The job description is short, so the screening criteria may need more detail.");
    if (categories.length > 4) difficulty.push("The role spans several responsibility categories, which can make sourcing and interviews less focused.");
    if (/flexible|any|tbd|open|varies/i.test(role.workSchedule + " " + role.timezoneOverlap)) difficulty.push("The schedule or overlap requirement is broad and should be clarified before sourcing.");
    if (/competitive|tbd|negotiable|depends/i.test(role.compensationBudget)) difficulty.push("The compensation budget is not specific enough to qualify candidates efficiently.");
    if (splitList(role.toolsKnowledge).length > 5) difficulty.push("The tool or industry requirement list may narrow the talent pool.");
    if (/asap|immediate|urgent/i.test(role.idealStartDate)) difficulty.push("The start date appears urgent, so screening speed and candidate availability matter.");

    var vagueWords = (combined.match(/\b(flexible|dynamic|fast-paced|rockstar|wear many hats|self-starter|as needed)\b/g) || []).length;
    var score = 100 - (missing.length * 7) - (conflicts.length * 8) - (difficulty.length * 5) - (vagueWords * 3);
    if (role.jobDescription.length < 350) score -= 10;
    if (categories.length === 0) score -= 12;
    score = Math.max(0, Math.min(100, score));

    return {
      score: score,
      scoreExplanation: "This is a practical clarity estimate based on completeness, focus, conflicts, and hiring friction. It is not scientific, predictive, guaranteed, or legal guidance.",
      categories: categories.length ? categories : ["General operations or support"],
      conflicts: conflicts.length ? conflicts : ["No major responsibility conflict detected from the submitted text."],
      missing: missing.length ? missing : ["No major required information gaps detected."],
      difficulty: difficulty.length ? difficulty : ["No major hiring difficulty indicators detected from the submitted text."],
      recommendations: [
        missing.length
          ? "Clarify the missing items first: " + missing.slice(0, 3).join(", ") + "."
          : "Turn the strongest responsibilities into a short scorecard before sourcing.",
        conflicts.length
          ? "Separate must-own responsibilities from occasional support work so candidates are screened against the real job."
          : "Define the three outcomes this person should own in the first 90 days.",
        difficulty.length
          ? "Resolve the difficulty indicators before outreach so candidate conversations stay practical."
          : "Use structured screening questions to compare candidates consistently."
      ]
    };
  }

  function buildBlueprint(role, diagnosis) {
    var responsibilities = splitList(role.responsibilities);
    var experience = splitList(role.requiredExperience);
    var tools = splitList(role.toolsKnowledge);
    var primaryCategory = diagnosis.categories[0] || "Role execution";
    var outcome = sentence(role.businessObjective, "The primary outcome should be clarified before sourcing.");

    return {
      roleSummary: role.jobTitle + " for " + primaryCategory.toLowerCase() + ", focused on " + outcome,
      primaryOutcome: outcome,
      mustHaveQualifications: experience.slice(0, 4).concat([
        role.workSchedule ? "Can reliably work the stated schedule: " + role.workSchedule : "",
        role.timezoneOverlap ? "Can cover the required time-zone overlap: " + role.timezoneOverlap : ""
      ]).filter(Boolean),
      niceToHaveQualifications: tools.slice(0, 4).concat([
        role.candidateRegions ? "Experience working with teams or clients across " + role.candidateRegions : "",
        "Comfort documenting work clearly in a remote environment"
      ]).filter(Boolean),
      responsibilityBoundaries: [
        responsibilities.length ? "Core work: " + responsibilities.slice(0, 5).join("; ") + "." : "Core responsibilities need clearer definition.",
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
        "What part of your background is closest to this " + role.jobTitle + " role?",
        "Tell me about a recent role where you owned: " + (responsibilities[0] || "a similar responsibility") + ".",
        "Which tools or workflows from this role have you used directly: " + (tools.slice(0, 3).join(", ") || "the required systems") + "?",
        "What schedule and time-zone overlap can you reliably commit to?",
        "What would you need clarified before accepting this role?"
      ],
      structuredInterviewQuestions: [
        "How would you approach the first two weeks in this " + role.jobTitle + " role?",
        "Walk through how you would deliver the primary outcome: " + outcome,
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
        "Own a first set of recurring responsibilities tied to " + primaryCategory.toLowerCase() + ".",
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
        "Prioritize candidates with evidence in " + diagnosis.categories.slice(0, 3).join(", ").toLowerCase() + ".",
        role.candidateRegions ? "Search within the approved candidate regions: " + role.candidateRegions + "." : "Define allowed candidate regions before sourcing.",
        "Screen for communication habits and remote handoff discipline early, not at the final interview."
      ],
      scheduleConsiderations: [
        role.workSchedule ? "Work schedule: " + role.workSchedule + "." : "Work schedule should be defined before outreach.",
        role.timezoneOverlap ? "Time-zone overlap: " + role.timezoneOverlap + "." : "Required overlap should be made explicit.",
        "If overlap is limited, define which meetings, handoffs, or client windows are non-negotiable."
      ],
      hiringRisks: diagnosis.difficulty.slice(0, 3).concat(diagnosis.conflicts.filter(function (item) {
        return item.indexOf("No major") !== 0;
      }).slice(0, 2)),
      recommendedNextStep: "Use this blueprint to tighten the role intake, then source and screen candidates against the scorecard instead of reviewing resumes in bulk."
    };
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function renderList(parent, items) {
    var list = make("ul");
    items.forEach(function (item) {
      list.appendChild(make("li", "", item));
    });
    parent.appendChild(list);
  }

  function renderDiagnosis(diagnosis) {
    clearNode(diagnosisPanel);
    var score = make("div", "score-meter");
    score.appendChild(make("span", "score-number", String(diagnosis.score)));
    score.appendChild(make("span", "score-label", "Role Clarity Score / 100"));
    diagnosisPanel.appendChild(score);
    diagnosisPanel.appendChild(make("p", "score-explanation", diagnosis.scoreExplanation));

    [
      ["Main responsibility categories detected", diagnosis.categories],
      ["Potentially conflicting responsibilities", diagnosis.conflicts],
      ["Missing information", diagnosis.missing],
      ["Hiring difficulty indicators", diagnosis.difficulty],
      ["Three immediate recommendations", diagnosis.recommendations]
    ].forEach(function (section) {
      var block = make("div", "diagnosis-block");
      block.appendChild(make("h3", "", section[0]));
      renderList(block, section[1]);
      diagnosisPanel.appendChild(block);
    });
  }

  function reportSections(blueprint) {
    return [
      ["1. Role summary", [blueprint.roleSummary]],
      ["2. Primary outcome of the position", [blueprint.primaryOutcome]],
      ["3. Must-have qualifications", blueprint.mustHaveQualifications],
      ["4. Nice-to-have qualifications", blueprint.niceToHaveQualifications],
      ["5. Responsibility boundaries", blueprint.responsibilityBoundaries],
      ["6. Candidate scorecard", blueprint.candidateScorecard.map(function (item) {
        return item.criterion + " (" + item.weight + "): " + item.evidence;
      })],
      ["7. Screening questions", blueprint.screeningQuestions],
      ["8. Structured interview questions", blueprint.structuredInterviewQuestions],
      ["9. Strong-answer indicators", blueprint.strongAnswerIndicators],
      ["10. Red flags", blueprint.redFlags],
      ["11. Suggested 30-day outcomes", blueprint.outcomes30],
      ["12. Suggested 60-day outcomes", blueprint.outcomes60],
      ["13. Suggested 90-day outcomes", blueprint.outcomes90],
      ["14. Recommended sourcing considerations", blueprint.sourcingConsiderations],
      ["15. Time-zone and schedule considerations", blueprint.scheduleConsiderations],
      ["16. Potential hiring risks", blueprint.hiringRisks],
      ["17. Recommended next step", [blueprint.recommendedNextStep]]
    ];
  }

  function buildReportText(role, diagnosis, blueprint) {
    var lines = [
      "Lateral Operations Role Blueprint",
      "",
      "Role: " + role.jobTitle,
      "Role Clarity Score: " + diagnosis.score + "/100",
      diagnosis.scoreExplanation,
      ""
    ];

    reportSections(blueprint).forEach(function (section) {
      lines.push(section[0]);
      section[1].forEach(function (item) {
        lines.push("- " + item);
      });
      lines.push("");
    });

    lines.push("Ready to turn this blueprint into a focused shortlist?");
    lines.push("Lateral Operations can personally source and screen candidates against this role through a founder-led Talent Sprint.");
    return lines.join("\n");
  }

  function renderReport(role, diagnosis, blueprint) {
    clearNode(reportPanel);
    reportPanel.appendChild(make("h2", "", "Your Role Blueprint"));
    reportPanel.appendChild(make("p", "score-explanation", "Role Clarity Score: " + diagnosis.score + "/100. " + diagnosis.scoreExplanation));

    reportSections(blueprint).forEach(function (section) {
      var block = make("section", "report-section");
      block.appendChild(make("h3", "", section[0]));
      renderList(block, section[1]);
      reportPanel.appendChild(block);
    });

    var cta = make("div", "report-cta");
    cta.appendChild(make("h3", "", "Ready to turn this blueprint into a focused shortlist?"));
    cta.appendChild(make("p", "", "Lateral Operations can personally source and screen candidates against this role through a founder-led Talent Sprint."));
    var actions = make("div", "cta-actions");
    var primary = make("a", "button primary", "Start a $750 Talent Sprint");
    primary.href = "https://calendar.app.google/tW24dFbjDKWzCcVLA";
    primary.target = "_blank";
    primary.rel = "noopener";
    var secondary = make("a", "button secondary dark", "Discuss My Blueprint with Alberto");
    secondary.href = "https://calendar.app.google/tW24dFbjDKWzCcVLA";
    secondary.target = "_blank";
    secondary.rel = "noopener";
    actions.appendChild(primary);
    actions.appendChild(secondary);
    cta.appendChild(actions);
    reportPanel.appendChild(cta);
  }

  function renderStatus(payload) {
    var status = document.querySelector("[data-delivery-status]");
    clearNode(status);

    [
      ["Report generated", payload.generated === true],
      ["Lead saved", payload.saved === true],
      ["Report email sent", payload.emailed === true]
    ].forEach(function (item) {
      var row = make("li", item[1] ? "status-ok" : "status-warn", item[0] + ": " + (item[1] ? "Yes" : "No"));
      status.appendChild(row);
    });

    if (payload.duplicate) {
      status.appendChild(make("li", "status-note", "Likely duplicate detected: stored for review instead of silently discarded."));
    }

    if (payload.message) {
      status.appendChild(make("li", "status-note", payload.message));
    }
  }

  function buildPayload() {
    var params = new URLSearchParams(window.location.search);
    return {
      role: state.role,
      lead: {
        firstName: getValue("firstName"),
        businessEmail: getValue("businessEmail"),
        companyName: getValue("companyName"),
        companyWebsite: getValue("companyWebsite"),
        phone: getValue("phone"),
        consent: form.elements.leadConsent && form.elements.leadConsent.checked === true,
        newsletterConsent: form.elements.newsletterConsent && form.elements.newsletterConsent.checked === true
      },
      website: getValue("website"),
      formStartedAt: startedAtInput ? startedAtInput.value : "",
      consentTimestamp: consentTimestampInput ? consentTimestampInput.value : "",
      utm: {
        source: params.get("utm_source") || "",
        medium: params.get("utm_medium") || "",
        campaign: params.get("utm_campaign") || ""
      }
    };
  }

  function validateRoleStep() {
    state.role = collectRole();
    var missing = missingRoleFields(state.role);
    if (missing.length) {
      formMessage.textContent = "Please complete these role fields: " + missing.join(", ") + ".";
      formMessage.className = "form-message is-error";
      return false;
    }
    formMessage.textContent = "";
    formMessage.className = "form-message";
    return true;
  }

  function validateLeadStep() {
    var missing = [];
    if (!getValue("firstName")) missing.push("first name");
    if (!getValue("businessEmail")) missing.push("business email");
    if (!getValue("companyName")) missing.push("company name");
    if (!form.elements.leadConsent.checked) missing.push("consent");

    if (missing.length) {
      formMessage.textContent = "Please complete these lead fields: " + missing.join(", ") + ".";
      formMessage.className = "form-message is-error";
      return false;
    }

    formMessage.textContent = "";
    formMessage.className = "form-message";
    return true;
  }

  async function submitNewsletterIfRequested(payload) {
    if (!payload.lead.newsletterConsent || !newsletterMessage) return;

    newsletterMessage.textContent = "Newsletter opt-in: submitting separately.";
    try {
      var response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: payload.lead.businessEmail,
          firstName: payload.lead.firstName,
          consent: true,
          website: "",
          formStartedAt: startedAtInput ? startedAtInput.value : String(Date.now() - 3000)
        })
      });
      var result = await response.json().catch(function () { return {}; });
      newsletterMessage.textContent = response.ok
        ? "Newsletter opt-in: " + (result.message || "submitted.")
        : "Newsletter opt-in: " + (result.error || "could not be completed.");
    } catch (error) {
      newsletterMessage.textContent = "Newsletter opt-in: could not be completed.";
    }
  }

  form.addEventListener("click", function (event) {
    var button = event.target.closest("[data-next-step]");
    if (!button) return;

    var next = button.getAttribute("data-next-step");
    if (next === "diagnosis" && !validateRoleStep()) return;

    if (next === "diagnosis") {
      state.diagnosis = analyzeRole(state.role);
      state.blueprint = buildBlueprint(state.role, state.diagnosis);
      state.reportText = buildReportText(state.role, state.diagnosis, state.blueprint);
      renderDiagnosis(state.diagnosis);
    }

    setStep(next);
  });

  form.addEventListener("change", function (event) {
    if (event.target && event.target.name === "leadConsent" && event.target.checked && consentTimestampInput) {
      consentTimestampInput.value = new Date().toISOString();
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (state.submitted) return;
    if (!validateLeadStep()) return;

    if (!state.diagnosis || !state.blueprint) {
      state.role = collectRole();
      state.diagnosis = analyzeRole(state.role);
      state.blueprint = buildBlueprint(state.role, state.diagnosis);
      state.reportText = buildReportText(state.role, state.diagnosis, state.blueprint);
    }

    var payload = buildPayload();
    state.submitted = true;
    submitButton.disabled = true;
    formMessage.textContent = "Generating the full Role Blueprint...";
    formMessage.className = "form-message";

    try {
      var response = await fetch("/api/role-blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      var result = await response.json().catch(function () { return {}; });

      if (!response.ok) {
        if (response.status < 500) {
          state.submitted = false;
          formMessage.textContent = result.error || "Please check the required Role Blueprint fields.";
          formMessage.className = "form-message is-error";
          return;
        }
        throw new Error(result.error || "The Role Blueprint could not be submitted.");
      }

      state.diagnosis = result.diagnosis || state.diagnosis;
      state.blueprint = result.blueprint || state.blueprint;
      state.reportText = result.reportText || state.reportText;
      renderReport(state.role, state.diagnosis, state.blueprint);
      renderStatus(result);
      formMessage.textContent = "Report generated. Storage and email status are shown below.";
      formMessage.className = "form-message is-success";
      await submitNewsletterIfRequested(payload);
      setStep("report");
    } catch (error) {
      state.submitted = false;
      renderReport(state.role, state.diagnosis, state.blueprint);
      renderStatus({
        generated: true,
        saved: false,
        emailed: false,
        message: error.message || "The report is available in this browser, but storage or email delivery failed."
      });
      formMessage.textContent = "Report generated in the browser. Storage or email delivery did not complete.";
      formMessage.className = "form-message is-error";
      setStep("report");
    } finally {
      submitButton.disabled = false;
    }
  });

  if (copyButton) {
    copyButton.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(state.reportText || reportPanel.textContent);
        copyButton.textContent = "Copied";
        setTimeout(function () {
          copyButton.textContent = "Copy Report";
        }, 1800);
      } catch (error) {
        copyButton.textContent = "Copy failed";
        setTimeout(function () {
          copyButton.textContent = "Copy Report";
        }, 1800);
      }
    });
  }

  if (printButton) {
    printButton.addEventListener("click", function () {
      window.print();
    });
  }

  if (startedAtInput) {
    startedAtInput.value = String(Date.now());
  }

  setStep("role");
}());
