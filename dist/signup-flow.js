var AnvisningerSignupFlow = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/signup-flow/src/index.js
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default,
    initSignupFlow: () => initSignupFlow
  });
  var BUILD_TIME = true ? "2026-02-13T14:49:06.641Z" : null;
  var DEFAULT_CONFIG = {
    sliderId: "slider-signup",
    cvrWorkerUrl: "https://anvisninger-cvr-dev.maxks.workers.dev/cvr",
    planWorkerUrl: "https://anvisninger-outseta-planinfo.maxks.workers.dev/plans",
    basisPlanUid: "BWzE5N9E",
    cvrInputId: "CVR-input",
    overlayId: "cvr-loading-overlay",
    errorBoxId: "errorBox",
    outputIds: {
      cvr: "CVR",
      name: "companyName",
      address: "companyAddress",
      employees: "companyEmployees",
      planName: "planName",
      pricePerYear: "pricePerYear"
    },
    radios: {
      privateOrOrg: { name: "privateOrOrganisation", values: ["Privat", "Erhverv"] },
      basisOrPro: { name: "basisOrPro", values: ["Basis", "Pro"] }
    },
    timeouts: {
      cvrMs: 12e3,
      planMs: 12e3
    },
    useWebflowReady: true,
    onPlanUidChange: null,
    handOffButtonId: "handOffOutseta",
    outsetaState: "checkout",
    registrationDefaultsBuilder: null,
    personFieldIds: {
      email: "Email",
      firstName: "firstName",
      lastName: "lastName",
      phone: "phoneNumber"
    },
    invoicingFieldIds: {
      ean: "EAN",
      invoiceEmail: "invoiceEmail"
    }
  };
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
    el.textContent = value === void 0 || value === null || value === "" ? "-" : String(value);
  }
  function showError(errorBoxId, msg) {
    const el = document.getElementById(errorBoxId);
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
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
    const m = /* @__PURE__ */ new Map();
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
  function syncNextArrowRequirement(sliderEl, radios) {
    const step = getCurrentStep(sliderEl);
    if (step === "privateOrOrganisation") {
      setRightArrowEnabled(sliderEl, !!getRadioValueByName(radios.privateOrOrg.name));
      return;
    }
    if (step === "basisOrPro") {
      setRightArrowEnabled(sliderEl, !!getRadioValueByName(radios.basisOrPro.name));
      return;
    }
    setRightArrowEnabled(sliderEl, true);
  }
  function resetAll(state, nav, errorBoxId) {
    nav.history = [];
    state.personType = null;
    state.subscriptionType = null;
    state.planUid = null;
    state.plan = null;
    state.company = { cvr: null, name: null, address: null, employees: null };
    showError(errorBoxId, "");
  }
  function resetAfterBasisOrPro(state, nav, errorBoxId) {
    nav.history = [];
    state.subscriptionType = null;
    state.planUid = null;
    state.plan = null;
    state.company = { cvr: null, name: null, address: null, employees: null };
    showError(errorBoxId, "");
  }
  function resetFromStep(step, state, nav, errorBoxId) {
    if (step === "privateOrOrganisation") return resetAll(state, nav, errorBoxId);
    if (step === "basisOrPro") return resetAfterBasisOrPro(state, nav, errorBoxId);
    if (step === "cvr") {
      nav.history = [];
      state.company = { cvr: null, name: null, address: null, employees: null };
      showError(errorBoxId, "");
      return;
    }
    showError(errorBoxId, "");
  }
  function nextAfterCVR(state) {
    if (state.subscriptionType === "paid") return "company";
    return "company";
  }
  function nextAfterCompany(state) {
    if (state.subscriptionType === "paid") return "planReview";
    if (state.personType === "organisation" && state.subscriptionType === "free") return "contact";
    return "invoicing";
  }
  async function fetchWithTimeout(url, timeoutMs, options) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs || 12e3);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data && data.error ? data.error : "Worker error (" + res.status + ")");
      }
      return data;
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
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
    const url = config.planWorkerUrl + "?employees=" + encodeURIComponent(String(employees));
    return fetchWithTimeout(url, config.timeouts.planMs, { headers: { Accept: "application/json" } });
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
      LastName: getInputValueById(config.personFieldIds.lastName)
    };
    const phone = getInputValueById(config.personFieldIds.phone);
    if (phone) person.PhoneMobile = phone;
    return {
      Person: person,
      Account: {
        Name: state.company.name || "",
        BillingAddress: state.company.address || "",
        AntalAnsatte: state.company.employees === void 0 || state.company.employees === null ? "" : String(state.company.employees),
        EAN: getInputValueById(config.invoicingFieldIds.ean),
        Faktureringsmail: getInputValueById(config.invoicingFieldIds.invoiceEmail)
      }
    };
  }
  function initSignupFlow(userConfig = {}) {
    const config = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      outputIds: { ...DEFAULT_CONFIG.outputIds, ...userConfig.outputIds || {} },
      radios: { ...DEFAULT_CONFIG.radios, ...userConfig.radios || {} },
      timeouts: { ...DEFAULT_CONFIG.timeouts, ...userConfig.timeouts || {} }
    };
    const state = {
      personType: null,
      subscriptionType: null,
      planUid: null,
      plan: null,
      company: { cvr: null, name: null, address: null, employees: null }
    };
    const nav = {
      history: [],
      isProgrammaticNav: false
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
      document.querySelectorAll('input[type="radio"][name="' + config.radios.privateOrOrg.name + '"]').forEach((r) => {
        r.addEventListener("change", () => {
          resetAll(state, nav, config.errorBoxId);
          syncNextArrowRequirement(sliderEl, config.radios);
        });
      });
      document.querySelectorAll('input[type="radio"][name="' + config.radios.basisOrPro.name + '"]').forEach((r) => {
        r.addEventListener("change", () => {
          resetAfterBasisOrPro(state, nav, config.errorBoxId);
          syncNextArrowRequirement(sliderEl, config.radios);
        });
      });
      const cvrInput = document.getElementById(config.cvrInputId);
      if (cvrInput) {
        cvrInput.addEventListener("input", () => showError(config.errorBoxId, ""));
      }
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
          const prevStep = nav.history.pop();
          if (!prevStep) return;
          e.preventDefault();
          e.stopPropagation();
          resetFromStep(prevStep, state, nav, config.errorBoxId);
          goToStep(sliderEl, stepToIndex, prevStep, nav);
          setTimeout(() => syncNextArrowRequirement(sliderEl, config.radios), 80);
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
          if (currentStep === "privateOrOrganisation") {
            e.preventDefault();
            e.stopPropagation();
            const value = getRadioValueByName(config.radios.privateOrOrg.name);
            if (!value) {
              showError(config.errorBoxId, "Please select Private or Business.");
              setRightArrowEnabled(sliderEl, false);
              return;
            }
            showError(config.errorBoxId, "");
            if (value === "Privat") {
              state.personType = "private";
              state.subscriptionType = "free";
              state.planUid = config.basisPlanUid;
              state.plan = {
                name: "Basis",
                annualRate: 0,
                planUid: config.basisPlanUid,
                maximumPeople: null
              };
              setPlanUI(state.plan, config);
              notifyPlanUidChange(config, state.planUid);
              goToStepWithHistory(sliderEl, stepToIndex, "contact", nav);
            } else {
              state.personType = "organisation";
              goToStepWithHistory(sliderEl, stepToIndex, "basisOrPro", nav);
            }
            return;
          }
          if (currentStep === "basisOrPro") {
            e.preventDefault();
            e.stopPropagation();
            const value = getRadioValueByName(config.radios.basisOrPro.name);
            if (!value) {
              showError(config.errorBoxId, "Please select Basis or Pro.");
              setRightArrowEnabled(sliderEl, false);
              return;
            }
            showError(config.errorBoxId, "");
            if (value === "Basis") {
              state.subscriptionType = "free";
              state.planUid = config.basisPlanUid;
              state.plan = {
                name: "Basis",
                annualRate: 0,
                planUid: config.basisPlanUid,
                maximumPeople: null
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
              showError(config.errorBoxId, "CVR input not found.");
              return;
            }
            if (inFlight) return;
            showError(config.errorBoxId, "");
            const cvr = (cvrInput.value || "").replace(/\s+/g, "");
            if (!/^\d{8}$/.test(cvr)) {
              showError(config.errorBoxId, "CVR must be 8 digits.");
              return;
            }
            inFlight = true;
            lockAllArrows(sliderEl, true);
            showOverlay(config.overlayId, true);
            try {
              const data = await fetchCVR(cvr, config);
              if (data.employees == null && state.subscriptionType === "paid") {
                showError(
                  config.errorBoxId,
                  "Employee count missing. Please contact sales for signup."
                );
                return;
              }
              state.company = {
                cvr: data.cvr || cvr,
                name: data.name || null,
                address: data.address || null,
                employees: data.employees === void 0 ? null : data.employees
              };
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
                  maximumPeople: null
                };
                setPlanUI(state.plan, config);
                notifyPlanUidChange(config, state.planUid);
              }
              goToStepWithHistory(sliderEl, stepToIndex, nextAfterCVR(state), nav);
            } catch (err) {
              console.error("[Flow] CVR/plan lookup failed:", err);
              showError(
                config.errorBoxId,
                err && err.message ? err.message : "Could not fetch details."
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
            showError(config.errorBoxId, "");
            goToStepWithHistory(sliderEl, stepToIndex, "invoicing", nav);
            return;
          }
          if (currentStep === "company") {
            e.preventDefault();
            e.stopPropagation();
            showError(config.errorBoxId, "");
            const nextStep = nextAfterCompany(state);
            goToStepWithHistory(sliderEl, stepToIndex, nextStep, nav);
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
          showError(config.errorBoxId, "");
          if (!state.planUid) {
            showError(config.errorBoxId, "Missing plan selection.");
            return;
          }
          if (!window.Outseta || !window.Outseta.auth || !window.Outseta.auth.open) {
            showError(config.errorBoxId, "Outseta embed is not available.");
            return;
          }
          const registrationDefaults = buildRegistrationDefaults(config, state);
          window.Outseta.auth.open({
            planUid: state.planUid,
            state: config.outsetaState,
            registrationDefaults
          });
        });
      } else {
        console.warn("[Flow] handoff button not found:", config.handOffButtonId);
      }
      console.log("[Flow] ready", {
        sliderId: config.sliderId,
        worker: config.cvrWorkerUrl,
        steps: Array.from(stepToIndex.keys())
      });
    }, config.useWebflowReady);
    return {
      getState: () => ({ ...state, company: { ...state.company } })
    };
  }
  var index_default = initSignupFlow;
  return __toCommonJS(index_exports);
})();
