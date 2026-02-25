const BUILD_TIME = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : null;

import { generateTransactionId, pushGAPurchaseEvent, setupOutsetaCompletionTracking } from "./ga-tracking.js";

// TODO: Future improvements:
// - Optimize error UI: Replace alert() with custom banner/modal for critical errors
// - Convert remaining IDs to kebab-case for Client-First compliance:
//   - cvrInputId: "CVR-input" → "cvr-input"
//   - outputIds: "CVR" → "cvr", "companyName" → "company-name", etc.
//   - radios.customerType.name: "customerType" → "customer-type"
//   - radios.basisOrPro.name: "basisOrPro" → "basis-or-pro"
//   - invoicingFieldIds: "EAN" → "ean", "Faktureringsmail" → "faktureringsmail"

const DEFAULT_CONFIG = {
  sliderId: "slider-signup",
  cvrWorkerUrl: "https://anvisninger-cvr-dev.maxks.workers.dev/cvr",
  planWorkerUrl: "https://anvisninger-outseta-planinfo.maxks.workers.dev/plans",
  basisPlanUid: "BWzE5N9E",
  cvrInputId: "CVR-input",
  overlayId: "cvr-loading-overlay",
  errorBoxIds: null,
  outputIds: {
    cvr: "CVR",
    name: "companyName",
    address: "companyAddress",
    employees: "companyEmployees",
    planName: "planName",
    pricePerYear: "pricePerYear",
  },
  radios: {
    customerType: { name: "customerType", values: ["Privat", "Erhverv", "Offentlig", "Uddannelse"] },
    basisOrPro: { name: "basisOrPro", values: ["Basis", "Pro"] },
  },
  timeouts: {
    cvrMs: 12000,
    planMs: 12000,
  },
  useWebflowReady: true,
  onPlanUidChange: null,
  handOffButtonId: "hand-off-outseta",
  outsetaState: "checkout",
  registrationDefaultsBuilder: null,
  personFieldIds: {
    email: "email",
    firstName: "first-name",
    lastName: "last-name",
    phone: "phone-number",
  },
  emailCheckWorkerUrl: null,
  emailCheckTimeoutMs: 8000,
  invoicingFieldIds: {
    ean: "EAN",
    invoiceEmail: "Faktureringsmail",
  },
  gaConfig: {
    companyName: "Anvisninger",
    itemCategory: "Abonnement",
    trackPurchase: true,
  },
};

const STEP_ORDER = [
  "customerType",
  "basisOrPro",
  "cvr",
  "company",
  "planReview",
  "invoicing",
  "contactSales",
  "contact",
];

function withDomReady(fn, useWebflowReady) {
  if (useWebflowReady && window.Webflow && Array.isArray(window.Webflow)) {
    window.Webflow.push(fn);
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
    return;
  }

  fn();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value === undefined || value === null || value === "" ? "-" : String(value);
}

function showError(errorBoxId, msg) {
  const el = document.getElementById(errorBoxId);
  if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
}

function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase to kebab-case
    .replace(/[\s_]+/g, "-") // spaces and underscores to hyphens
    .toLowerCase();
}

function getErrorBoxId(config, step, fieldId = null) {
  // Allow custom override via errorBoxIds
  if (config.errorBoxIds && step && config.errorBoxIds[step]) {
    return config.errorBoxIds[step];
  }

  // Generate ID from step and optional field: errorbox-{step}-{field} or errorbox-{step}
  // Using lowercase kebab-case following Client-First conventions
  if (step) {
    const stepKebab = toKebabCase(step);
    if (fieldId) {
      const fieldKebab = toKebabCase(fieldId);
      return `errorbox-${stepKebab}-${fieldKebab}`;
    }
    return `errorbox-${stepKebab}`;
  }

  return null;
}

function showErrorForStep(config, step, msg) {
  const id = getErrorBoxId(config, step);
  if (!id) return;
  showError(id, msg);
}

function showErrorForCurrent(sliderEl, config, msg) {
  const step = getCurrentStep(sliderEl);
  showErrorForStep(config, step, msg);
}

function showInvoicingError(config, fieldKey, msg) {
  // Map friendly keys to actual field IDs
  const fieldIdMap = {
    email: config.invoicingFieldIds.invoiceEmail,
    ean: config.invoicingFieldIds.ean,
  };
  const fieldId = fieldIdMap[fieldKey] || fieldKey;
  const id = getErrorBoxId(config, "invoicing", fieldId);
  if (!id) return;
  showError(id, msg);
}

function clearInvoicingErrors(config) {
  // Clear both invoicing field errors
  showInvoicingError(config, "email", "");
  showInvoicingError(config, "ean", "");
}

function clearAllErrors(config) {
  // Clear general step errors
  STEP_ORDER.forEach((step) => showErrorForStep(config, step, ""));
  
  // Clear specific field errors
  clearInvoicingErrors(config);
  showError(getErrorBoxId(config, "contact", config.personFieldIds.email), "");
  showError(getErrorBoxId(config, "contact", config.personFieldIds.firstName), "");
  showError(getErrorBoxId(config, "contact", config.personFieldIds.lastName), "");
  showError(getErrorBoxId(config, "contact", config.personFieldIds.phone), "");
}

function showOverlay(overlayId, show) {
  const el = document.getElementById(overlayId);
  if (!el) return;

  if (show) {
    el.style.display = "flex";
    el.style.flexDirection = "row";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.gap = "0px";
  } else {
    el.style.display = "none";
  }
}

function lockAllArrows(sliderEl, lock) {
  const arrows = sliderEl.querySelectorAll(
    ".w-slider-arrow-right, .w-slider-arrow-left"
  );
  arrows.forEach((arrow) => {
    arrow.style.pointerEvents = lock ? "none" : "";
    arrow.style.opacity = lock ? "0.4" : "";
    arrow.style.cursor = lock ? "default" : "";
    arrow.setAttribute("aria-disabled", lock ? "true" : "false");
  });
}

function setRightArrowEnabled(sliderEl, enabled) {
  const right = sliderEl.querySelector(".w-slider-arrow-right");
  if (!right) return;
  right.style.pointerEvents = enabled ? "" : "none";
  right.style.opacity = enabled ? "" : "0.4";
  right.style.cursor = enabled ? "" : "default";
  right.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function getSlides(sliderEl) {
  return Array.from(sliderEl.querySelectorAll(".w-slide"));
}

function getCurrentIndex(sliderEl) {
  const dots = Array.from(sliderEl.querySelectorAll(".w-slider-dot"));
  const activeIdx = dots.findIndex((d) => d.classList.contains("w-active"));
  if (activeIdx >= 0) return activeIdx;

  const slides = getSlides(sliderEl);
  const currentIdx = slides.findIndex((s) => s.classList.contains("w--current"));
  return currentIdx >= 0 ? currentIdx : 0;
}

function getCurrentStep(sliderEl) {
  const slides = getSlides(sliderEl);
  const idx = getCurrentIndex(sliderEl);
  const slide = slides[idx] || slides[0];
  return slide ? (slide.getAttribute("data-step") || "").trim() : null;
}

function buildStepToIndex(sliderEl) {
  const slides = getSlides(sliderEl);
  const m = new Map();
  slides.forEach((s, i) => {
    const step = (s.getAttribute("data-step") || "").trim();
    if (step) m.set(step, i);
  });
  return m;
}

function clickDot(sliderEl, index) {
  const dots = sliderEl.querySelectorAll(".w-slider-dot");
  const dot = dots && dots[index];
  if (!dot) {
    console.warn("[Flow] dot not found for index:", index);
    return;
  }
  dot.click();
}

function goToStep(sliderEl, stepToIndex, stepName, nav) {
  const idx = stepToIndex.get(stepName);
  if (typeof idx !== "number") {
    console.error("[Flow] Unknown step:", stepName, "known:", Array.from(stepToIndex.keys()));
    return;
  }
  nav.isProgrammaticNav = true;
  clickDot(sliderEl, idx);
  setTimeout(() => {
    nav.isProgrammaticNav = false;
  }, 150);
}

function goToStepWithHistory(sliderEl, stepToIndex, targetStep, nav) {
  const currentStep = getCurrentStep(sliderEl);
  if (currentStep && currentStep !== targetStep) nav.history.push(currentStep);
  goToStep(sliderEl, stepToIndex, targetStep, nav);
}

function getRadioValueByName(name) {
  const checked = document.querySelector(
    'input[type="radio"][name="' + name + '"]:checked'
  );
  return checked ? checked.value : null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidEan(value) {
  return /^\d{13}$/.test(value);
}

function isValidDanishPhone(phone) {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  // Valid if 8 digits (Danish without country code) or 10+ digits (with country code like 0045 or +45)
  return digits.length === 8 || digits.length >= 10;
}

function formatDanishPhone(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  // If 8 digits, add +45 prefix
  if (digits.length === 8) {
    return "+45" + digits;
  }
  // If starts with 0045, convert to +45
  if (digits.startsWith("0045")) {
    return "+45" + digits.slice(4);
  }
  // Otherwise return as-is (already has country code like +45...)
  return phone;
}

function syncNextArrowRequirement(sliderEl, radios) {
  const step = getCurrentStep(sliderEl);

  if (step === "customerType") {
    setRightArrowEnabled(sliderEl, !!getRadioValueByName(radios.customerType.name));
    return;
  }
  if (step === "basisOrPro") {
    setRightArrowEnabled(sliderEl, !!getRadioValueByName(radios.basisOrPro.name));
    return;
  }
  if (step === "contactSales") {
    setRightArrowEnabled(sliderEl, false);
    return;
  }
  setRightArrowEnabled(sliderEl, true);
}

function resetState(state, nav, config, keepPersonType = false) {
  nav.history = [];
  if (!keepPersonType) state.personType = null;
  state.subscriptionType = null;
  state.planUid = null;
  state.plan = null;
  state.company = { cvr: null, name: null, address: null, employees: null };
  clearAllErrors(config);
}

function resetFromStep(step, state, nav, config) {
  if (step === "customerType") return resetState(state, nav, config);
  if (step === "basisOrPro") return resetState(state, nav, config, true);
  if (step === "cvr") {
    nav.history = [];
    state.company = { cvr: null, name: null, address: null, employees: null };
    showErrorForStep(config, "cvr", "");
    return;
  }
  showErrorForStep(config, step, "");
}

function nextAfterCompany(state) {
  if (state.subscriptionType === "paid") return "planReview";
  if (state.personType === "organisation" && state.subscriptionType === "free") return "contact";
  return "invoicing";
}

async function fetchWithTimeout(url, timeoutMs, options) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs || 12000);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Handle specific status codes with user-friendly messages
      let errorMsg = "";
      let isCritical = false;
      
      if (res.status === 403) {
        errorMsg = "Systemet er ikke tilgængeligt fra dit lokation. Kontakt venligst support.";
        isCritical = true;
      } else if (res.status === 404) {
        errorMsg = "Systemet svarede ikke korrekt. Prøv igen senere.";
        isCritical = true;
      } else if (res.status >= 500) {
        errorMsg = "Serveren har problemer. Prøv igen senere.";
        isCritical = true;
      } else {
        // Use server error message if available
        errorMsg = data && data.error ? data.error : "Systemfejl (" + res.status + ")";
      }
      
      const err = new Error(errorMsg);
      err.isCritical = isCritical;
      throw err;
    }
    return data;
  } catch (err) {
    if (err && err.name === "AbortError") {
      const timeoutErr = new Error("Anmodningen tok for lang tid. Prøv igen.");
      timeoutErr.isCritical = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function fetchCVR(cvr, config) {
  const url = config.cvrWorkerUrl + "?cvr=" + encodeURIComponent(cvr);
  return fetchWithTimeout(url, config.timeouts.cvrMs, { headers: { Accept: "application/json" } });
}

async function fetchPlanInfoByEmployees(employees, config) {
  const url =
    config.planWorkerUrl + "?employees=" + encodeURIComponent(String(employees));
  return fetchWithTimeout(url, config.timeouts.planMs, { headers: { Accept: "application/json" } });
}

async function checkEmailExists(email, config) {
  if (!email || !isValidEmail(email)) return { exists: false };

  const baseUrl = config.emailCheckWorkerUrl
    ? config.emailCheckWorkerUrl
    : config.planWorkerUrl.replace(/\/plans$/, "/check-email");
  const url = baseUrl + "?email=" + encodeURIComponent(email);

  try {
    const res = await fetchWithTimeout(url, config.emailCheckTimeoutMs, {
      headers: { Accept: "application/json" },
    });
    return res;
  } catch (err) {
    console.error("[Flow] email check failed:", err);
    return { exists: false, error: err && err.message ? err.message : null };
  }
}

function formatDKK(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("da-DK", { maximumFractionDigits: 0 });
}

function setPlanUI(plan, config) {
  if (!plan) {
    setText(config.outputIds.planName, "-");
    setText(config.outputIds.pricePerYear, "-");
    return;
  }

  setText(config.outputIds.planName, plan.name || "-");

  if (plan.planUid === config.basisPlanUid) {
    setText(config.outputIds.pricePerYear, "0");
    return;
  }

  setText(config.outputIds.pricePerYear, formatDKK(plan.annualRate));
}

function notifyPlanUidChange(config, planUid) {
  if (typeof config.onPlanUidChange === "function") {
    config.onPlanUidChange(planUid);
  }
}

function getInputValueById(id) {
  if (!id) return "";
  const el = document.getElementById(id);
  if (!el) return "";
  return (el.value || "").trim();
}

function buildRegistrationDefaults(config, state) {
  if (typeof config.registrationDefaultsBuilder === "function") {
    return config.registrationDefaultsBuilder(state);
  }

  const person = {
    Email: getInputValueById(config.personFieldIds.email),
    FirstName: getInputValueById(config.personFieldIds.firstName),
    LastName: getInputValueById(config.personFieldIds.lastName),
  };
  const phone = getInputValueById(config.personFieldIds.phone);
  if (phone) {
    person.PhoneMobile = formatDanishPhone(phone);
  }

  return {
    Person: person,
    Account: {
      Name: state.company.name || "",
      BillingAddress: state.company.address || "",
      AntalAnsatte:
        state.company.employees === undefined || state.company.employees === null
          ? ""
          : String(state.company.employees),
      EAN: getInputValueById(config.invoicingFieldIds.ean),
      Faktureringsmail: getInputValueById(config.invoicingFieldIds.invoiceEmail),
    },
  };
}

export function initSignupFlow(userConfig = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    outputIds: { ...DEFAULT_CONFIG.outputIds, ...(userConfig.outputIds || {}) },
    radios: { ...DEFAULT_CONFIG.radios, ...(userConfig.radios || {}) },
    timeouts: { ...DEFAULT_CONFIG.timeouts, ...(userConfig.timeouts || {}) },
    gaConfig: { ...DEFAULT_CONFIG.gaConfig, ...(userConfig.gaConfig || {}) },
  };

  const state = {
    personType: null,
    subscriptionType: null,
    planUid: null,
    plan: null,
    company: { cvr: null, name: null, address: null, employees: null },
  };

  const nav = {
    history: [],
    isProgrammaticNav: false,
  };

  if (BUILD_TIME) {
    console.log("[Flow] build time", BUILD_TIME);
  } else {
    console.log("[Flow] build time unknown");
  }

  withDomReady(() => {
    const sliderEl = document.getElementById(config.sliderId);
    if (!sliderEl) {
      console.error("[Flow] slider not found:", config.sliderId);
      return;
    }

    const stepToIndex = buildStepToIndex(sliderEl);

    document
      .querySelectorAll('input[type="radio"][name="' + config.radios.customerType.name + '"]')
      .forEach((r) => {
        r.addEventListener("change", () => {
          resetState(state, nav, config);
          syncNextArrowRequirement(sliderEl, config.radios);
        });
      });

    document
      .querySelectorAll('input[type="radio"][name="' + config.radios.basisOrPro.name + '"]')
      .forEach((r) => {
        r.addEventListener("change", () => {
          resetState(state, nav, config, true);
          syncNextArrowRequirement(sliderEl, config.radios);
        });
      });

    // Helper to clear field errors on input
    const attachInputClearer = (fieldId, step, field) => {
      const input = document.getElementById(fieldId);
      if (!input) return;
      const clearError = () => showError(getErrorBoxId(config, step, field), "");
      if (step === "invoicing") {
        input.addEventListener("input", () => {
          if (field === "email") showInvoicingError(config, "email", "");
          else if (field === "ean") showInvoicingError(config, "ean", "");
        });
      } else {
        input.addEventListener("input", clearError);
      }
    };

    // Attach input listeners for CVR validation
    const cvrInput = document.getElementById(config.cvrInputId);
    if (cvrInput) {
      cvrInput.addEventListener("input", () => showErrorForStep(config, "cvr", ""));
    }

    // Email duplicate check on blur
    const emailInput = document.getElementById(config.personFieldIds.email);
    if (emailInput) {
      emailInput.addEventListener("blur", async () => {
        const email = (emailInput.value || "").trim();
        if (!email) {
          showError(getErrorBoxId(config, "contact", config.personFieldIds.email), "");
          return;
        }

        const result = await checkEmailExists(email, config);
        if (result.exists) {
          showError(getErrorBoxId(config, "contact", config.personFieldIds.email), "Denne e-mailadresse er allerede registreret. Brug venligst en anden e-mailadresse.");
        } else {
          showError(getErrorBoxId(config, "contact", config.personFieldIds.email), "");
        }
      });
    }

    // Attach error clearers for contact fields
    attachInputClearer(config.personFieldIds.firstName, "contact", config.personFieldIds.firstName);
    attachInputClearer(config.personFieldIds.lastName, "contact", config.personFieldIds.lastName);
    attachInputClearer(config.invoicingFieldIds.invoiceEmail, "invoicing", "email");
    attachInputClearer(config.invoicingFieldIds.ean, "invoicing", "ean");

    sliderEl.addEventListener(
      "click",
      () => {
        setTimeout(() => syncNextArrowRequirement(sliderEl, config.radios), 60);
      },
      true
    );
    setTimeout(() => syncNextArrowRequirement(sliderEl, config.radios), 80);

    sliderEl.addEventListener(
      "click",
      (e) => {
        const backArrow = e.target.closest(".w-slider-arrow-left");
        if (!backArrow) return;
        if (nav.isProgrammaticNav) return;

        const currentStep = getCurrentStep(sliderEl);
        const prevStep = nav.history.pop();
        if (!prevStep) return;

        e.preventDefault();
        e.stopPropagation();

        // If coming back from contactSales to customerType, keep the selection
        if (currentStep === "contactSales" && prevStep === "customerType") {
          goToStep(sliderEl, stepToIndex, prevStep, nav);
          setTimeout(() => syncNextArrowRequirement(sliderEl, config.radios), 80);
        } else {
          resetFromStep(prevStep, state, nav, config);
          goToStep(sliderEl, stepToIndex, prevStep, nav);
          setTimeout(() => syncNextArrowRequirement(sliderEl, config.radios), 80);
        }
      },
      true
    );

    let inFlight = false;

    sliderEl.addEventListener(
      "click",
      async (e) => {
        const nextArrow = e.target.closest(".w-slider-arrow-right");
        if (!nextArrow) return;

        const currentStep = getCurrentStep(sliderEl);

        if (currentStep === "customerType") {
          e.preventDefault();
          e.stopPropagation();

          const value = getRadioValueByName(config.radios.customerType.name);

          if (value === "Privat") {
            state.personType = "private";
            state.subscriptionType = "free";
            state.planUid = config.basisPlanUid;
            state.plan = {
              name: "Basis",
              annualRate: 0,
              planUid: config.basisPlanUid,
              maximumPeople: null,
            };
            setPlanUI(state.plan, config);
            notifyPlanUidChange(config, state.planUid);
            goToStepWithHistory(sliderEl, stepToIndex, "contact", nav);
          } else if (value === "Erhverv") {
            state.personType = "organisation";
            goToStepWithHistory(sliderEl, stepToIndex, "basisOrPro", nav);
          } else if (value === "Offentlig" || value === "Uddannelse") {
            state.personType = value.toLowerCase();
            goToStepWithHistory(sliderEl, stepToIndex, "contactSales", nav);
          }
          return;
        }

        if (currentStep === "basisOrPro") {
          e.preventDefault();
          e.stopPropagation();

          const value = getRadioValueByName(config.radios.basisOrPro.name);

          if (value === "Basis") {
            state.subscriptionType = "free";
            state.planUid = config.basisPlanUid;
            state.plan = {
              name: "Basis",
              annualRate: 0,
              planUid: config.basisPlanUid,
              maximumPeople: null,
            };
            setPlanUI(state.plan, config);
            notifyPlanUidChange(config, state.planUid);
          } else {
            state.subscriptionType = "paid";
            state.planUid = null;
            state.plan = null;
            setPlanUI(null, config);
            notifyPlanUidChange(config, null);
          }

          goToStepWithHistory(sliderEl, stepToIndex, "cvr", nav);
          return;
        }

        if (currentStep === "cvr") {
          e.preventDefault();
          e.stopPropagation();

          if (!cvrInput) {
            showErrorForStep(config, currentStep, "Der opstod en teknisk fejl. Opdater siden og prøv igen.");
            return;
          }
          if (inFlight) return;

          showErrorForStep(config, currentStep, "");

          const cvr = (cvrInput.value || "").replace(/\s+/g, "");
          if (!/^\d{8}$/.test(cvr)) {
            showErrorForStep(config, currentStep, "CVR skal være 8 cifre.");
            return;
          }

          inFlight = true;
          lockAllArrows(sliderEl, true);
          showOverlay(config.overlayId, true);

          try {
            const data = await fetchCVR(cvr, config);

            // Check if CVR was not found in registry
            if (data.error) {
              throw new Error(data.error);
            }

            if (!data.cvr || !data.name) {
              throw new Error("CVR blev ikke fundet. Tjek at CVR'et er korrekt.");
            }

            if (data.employees == null && state.subscriptionType === "paid") {
              showErrorForStep(
                config,
                currentStep,
                "Vi kunne ikke finde medarbejdertallet for denne virksomhed. Kontakt venligst vores salgsteam."
              );
              return;
            }

            state.company = {
              cvr: data.cvr || cvr,
              name: data.name || null,
              address: data.address || null,
              employees: data.employees === undefined ? null : data.employees,
            };

            // Validate required company information
            if (!state.company.name) {
              throw new Error("Virksomhedsnavn kunne ikke findes. Tjek CVR'et.");
            }

            if (!state.company.address) {
              throw new Error("Virksomhedsadresse kunne ikke findes. Kontakt venligst vores salgsteam.");
            }

            setText(config.outputIds.cvr, state.company.cvr);
            setText(config.outputIds.name, state.company.name);
            setText(config.outputIds.address, state.company.address);
            setText(
              config.outputIds.employees,
              state.company.employees == null ? "-" : state.company.employees
            );

            if (state.subscriptionType === "paid") {
              const employees = state.company.employees;
              if (employees == null) {
                throw new Error("Employee count missing for paid subscription.");
              }

              const planResp = await fetchPlanInfoByEmployees(employees, config);
              const selected = planResp && planResp.plan ? planResp.plan : null;
              const planUid = selected?.planUid || selected?.Uid || planResp?.planUid || null;

              if (!selected || !planUid) {
                throw new Error("No plan found for employee count.");
              }

              state.planUid = planUid;
              state.plan = selected;
              setPlanUI(selected, config);
              notifyPlanUidChange(config, state.planUid);
            } else {
              state.planUid = config.basisPlanUid;
              state.plan = {
                name: "Basis",
                annualRate: 0,
                planUid: config.basisPlanUid,
                maximumPeople: null,
              };
              setPlanUI(state.plan, config);
              notifyPlanUidChange(config, state.planUid);
            }

            goToStepWithHistory(sliderEl, stepToIndex, "company", nav);
          } catch (err) {
            console.error("[Flow] CVR/plan lookup failed:", err);
            
            // Mark as critical error if worker is broken
            if (err && err.isCritical) {
              window.AnvisningerSignupFlow.setCriticalError();
            }
            
            showErrorForStep(
              config,
              currentStep,
              err && err.message ? err.message : "Vi kunne ikke hente virksomhedsoplysninger. Tjek CVR'et og prøv igen."
            );
          } finally {
            showOverlay(config.overlayId, false);
            lockAllArrows(sliderEl, false);
            inFlight = false;
            setTimeout(() => syncNextArrowRequirement(sliderEl, config.radios), 80);
          }

          return;
        }

        if (currentStep === "planReview") {
          e.preventDefault();
          e.stopPropagation();

          showErrorForStep(config, currentStep, "");
          goToStepWithHistory(sliderEl, stepToIndex, "invoicing", nav);
          return;
        }

        if (currentStep === "company") {
          e.preventDefault();
          e.stopPropagation();

          // Clear step error before proceeding
          showErrorForStep(config, currentStep, "");
          const nextStep = nextAfterCompany(state);
          goToStepWithHistory(sliderEl, stepToIndex, nextStep, nav);
          return;
        }

        if (currentStep === "contactSales") {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (currentStep === "invoicing") {
          e.preventDefault();
          e.stopPropagation();

          // Clear invoicing field errors before validation
          clearInvoicingErrors(config);

          const invoiceEmail = getInputValueById(config.invoicingFieldIds.invoiceEmail);
          const ean = getInputValueById(config.invoicingFieldIds.ean);
          let hasError = false;

          if (invoiceEmail && !isValidEmail(invoiceEmail)) {
            showInvoicingError(config, "email", "Faktureringse-mailadresse er ugyldig.");
            hasError = true;
          }

          if (ean && !isValidEan(ean)) {
            showInvoicingError(config, "ean", "EAN skal være 13 cifre.");
            hasError = true;
          }

          if (hasError) return;

          goToStepWithHistory(sliderEl, stepToIndex, "contact", nav);
          return;
        }
      },
      true
    );

    const form = sliderEl.closest("form");
    if (form) form.addEventListener("submit", (e) => e.preventDefault());

    const handOffButton = document.getElementById(config.handOffButtonId);
    if (handOffButton) {
      handOffButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Clear all contact field errors before validation
        showError(getErrorBoxId(config, "contact", config.personFieldIds.firstName), "");
        showError(getErrorBoxId(config, "contact", config.personFieldIds.lastName), "");
        showError(getErrorBoxId(config, "contact", config.personFieldIds.email), "");
        showError(getErrorBoxId(config, "contact", config.personFieldIds.phone), "");

        // Validate required contact fields
        const firstName = getInputValueById(config.personFieldIds.firstName);
        const lastName = getInputValueById(config.personFieldIds.lastName);
        const email = getInputValueById(config.personFieldIds.email);

        let hasError = false;

        if (!firstName) {
          showError(getErrorBoxId(config, "contact", config.personFieldIds.firstName), "Fornavn er påkrævet.");
          hasError = true;
        }

        if (!lastName) {
          showError(getErrorBoxId(config, "contact", config.personFieldIds.lastName), "Efternavn er påkrævet.");
          hasError = true;
        }

        if (!email || !isValidEmail(email)) {
          showError(getErrorBoxId(config, "contact", config.personFieldIds.email), "En gyldig e-mailadresse er påkrævet.");
          hasError = true;
        }

        const phone = getInputValueById(config.personFieldIds.phone);
        if (phone && !isValidDanishPhone(phone)) {
          showError(getErrorBoxId(config, "contact", config.personFieldIds.phone), "Telefonnummeret skal være 8 cifre (dansk) eller inkludere landekode.");
          hasError = true;
        }

        if (hasError) return;

        if (!window.Outseta || !window.Outseta.auth || !window.Outseta.auth.open) {
          showErrorForCurrent(sliderEl, config, "Betalingssystemet er ikke tilgængeligt. Prøv igen senere.");
          return;
        }

        const registrationDefaults = buildRegistrationDefaults(config, state) || {};
        const personDefaults = registrationDefaults.Person || {};
        const accountDefaults = registrationDefaults.Account || {};

        registrationDefaults.Person = personDefaults;
        registrationDefaults.Account = accountDefaults;
        registrationDefaults.PersonAccount = {
          Person: personDefaults,
          Account: accountDefaults,
        };

        window.Outseta.auth.open({
          planUid: state.planUid,
          state: config.outsetaState,
          registrationDefaults,
        });

        // Track GA purchase event when registration completes
        setupOutsetaCompletionTracking(config, state);
      });
    } else {
      console.warn("[Flow] handoff button not found:", config.handOffButtonId);
    }

    console.log("[Flow] ready", {
      sliderId: config.sliderId,
      worker: config.cvrWorkerUrl,
      steps: Array.from(stepToIndex.keys()),
    });
  }, config.useWebflowReady);

  return {
    getState: () => ({ ...state, company: { ...state.company } }),
  };
}

// Global object to track library state and critical errors
window.AnvisningerSignupFlow = window.AnvisningerSignupFlow || {};
window.AnvisningerSignupFlow.initSignupFlow = initSignupFlow;
window.AnvisningerSignupFlow.isCritical = false;

// Function to mark critical error (called from library when critical errors occur)
window.AnvisningerSignupFlow.setCriticalError = function() {
  window.AnvisningerSignupFlow.isCritical = true;
  console.warn("[Flow] Critical error detected - form is broken");
};

export default initSignupFlow;