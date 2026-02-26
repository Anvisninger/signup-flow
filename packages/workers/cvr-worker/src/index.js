const ALLOWED_ORIGINS = [
  "https://anvisninger-dk-e81a432f7570a8eceb515ecb.webflow.io",
  "https://anvisninger.dk",
];

function getCorsHeaders(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }
  return {};
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // Check origin
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cors = getCorsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname !== "/cvr") return new Response("Not found", { status: 404, headers: cors });

    const cvr = (url.searchParams.get("cvr") || "").replace(/\s+/g, "");
    const debug = url.searchParams.get("debug") === "1";

    if (!/^\d{8}$/.test(cvr)) {
      return json({ error: "Invalid CVR. Must be 8 digits." }, 400, cors);
    }

    const companyUrl = `https://api.cvr.dev/api/cvr/virksomhed?cvr_nummer=${encodeURIComponent(cvr)}`;

    // Cache: use a separate cache key per CVR
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;

    // Only cache non-debug requests
    if (!debug) {
      const cached = await cache.match(cacheKey);
      if (cached) return withCors(cached, cors);
    }

    // cvr.dev docs: Authorization: Bearer <api-key>
    const companyRes = await fetch(companyUrl, {
      headers: { Authorization: `Bearer ${env.CVR_DEV_API_KEY}` },
    });

    const companyText = await companyRes.text();

    if (!companyRes.ok) {
      return json(
        {
          error: `Company lookup failed (${companyRes.status})`,
          ...(debug ? { companySample: companyText.slice(0, 800) } : {}),
        },
        companyRes.status,
        cors
      );
    }

    let list;
    try {
      list = JSON.parse(companyText);
    } catch {
      return json(
        { error: "Upstream returned invalid JSON.", ...(debug ? { companySample: companyText.slice(0, 800) } : {}) },
        502,
        cors
      );
    }

    const company = Array.isArray(list) ? list[0] : null;
    if (!company) return json({ error: "Company not found." }, 404, cors);

    const meta = company.virksomhedMetadata || {};

    // Name
    const name =
      meta?.nyesteNavn?.navn ||
      company?.navne?.[0]?.navn ||
      null;

    // Company form
    const virksomhedsform =
      meta?.nyesteVirksomhedsform?.kortBeskrivelse ||
      company?.virksomhedsform?.[0]?.kortBeskrivelse ||
      null;
    // ENK = Enkeltmandsvirksomhed, PMV = Personligt ejet mindre virksomhed
    const SOLE_TRADE_CODES = ["ENK", "PMV"];
    const isSoleTrade = virksomhedsform
      ? SOLE_TRADE_CODES.includes(virksomhedsform.toUpperCase())
      : false;

    // Address
    const addr =
      meta?.nyesteBeliggenhedsadresse ||
      company?.beliggenhedsadresse?.[0] ||
      meta?.nyestePostadresse ||
      company?.postadresse?.[0] ||
      null;

    const address = formatDkAddress(addr);
    const addressObject = buildOutsetaAddress(addr);

    // Employees: read from the raw sorted arrays so we always get the truly
    // most recent period — the virksomhedMetadata "nyeste*" shortcuts can lag
    // behind the underlying arrays in edge cases.
    //
    // Priority: monthly > quarterly > annual.
    // Within each type, sort descending by aar (+ maaned/kvartal) and take
    // the first entry with a non-null antalAnsatte.
    //
    // For annual records we also check antalInklusivEjere: this counts owners
    // as well as employees, and it's what virk.dk displays for small firms /
    // sole traders where antalAnsatte is 0.

    const latestMonthly = latestRecord(company.maanedsbeskaeftigelse, (r) => r.aar * 100 + (r.maaned || 0));
    const latestQuarterly = latestRecord(company.kvartalsbeskaeftigelse, (r) => r.aar * 10 + (r.kvartal || 0));
    const latestAnnual = latestRecord(company.aarsbeskaeftigelse, (r) => r.aar);

    let employees = null;
    let employeesSource = "none";
    let employeesPeriod = null;

    if (latestMonthly?.antalAnsatte != null) {
      employees = latestMonthly.antalAnsatte;
      employeesSource = "monthly";
      employeesPeriod = `${latestMonthly.aar}-${String(latestMonthly.maaned).padStart(2, "0")}`;
    } else if (latestQuarterly?.antalAnsatte != null) {
      employees = latestQuarterly.antalAnsatte;
      employeesSource = "quarterly";
      employeesPeriod = `${latestQuarterly.aar}-Q${latestQuarterly.kvartal}`;
    } else if (latestAnnual?.antalAnsatte != null) {
      employees = latestAnnual.antalAnsatte;
      employeesSource = "annual";
      employeesPeriod = String(latestAnnual.aar);
    }

    // If antalAnsatte is 0 but antalInklusivEjere is set (owner counts),
    // use that instead — this matches what virk.dk shows for small firms.
    if ((employees == null || employees === 0) && latestAnnual?.antalInklusivEjere) {
      employees = latestAnnual.antalInklusivEjere;
      employeesSource = "annualInklusivEjere";
      employeesPeriod = String(latestAnnual.aar);
    }

    // Last resort for sole traders with no employment records at all
    if (employees == null && isSoleTrade) {
      employees = 1;
      employeesSource = "soleTrade";
    }

    const payload = {
      cvr,
      name,
      address,
      addressObject,
      employees,
      employeesSource,
      employeesPeriod,
      isSoleTrade,
      ...(debug
        ? {
            debug: {
              companyStatus: companyRes.status,
              employeesSource,
              employeesPeriod,
              latestMonthly: latestMonthly
                ? { aar: latestMonthly.aar, maaned: latestMonthly.maaned, antalAnsatte: latestMonthly.antalAnsatte, intervalKode: latestMonthly.intervalKodeAntalAnsatte }
                : null,
              latestQuarterly: latestQuarterly
                ? { aar: latestQuarterly.aar, kvartal: latestQuarterly.kvartal, antalAnsatte: latestQuarterly.antalAnsatte, intervalKode: latestQuarterly.intervalKodeAntalAnsatte }
                : null,
              latestAnnual: latestAnnual
                ? { aar: latestAnnual.aar, antalAnsatte: latestAnnual.antalAnsatte, antalInklusivEjere: latestAnnual.antalInklusivEjere, intervalKode: latestAnnual.intervalKodeAntalAnsatte }
                : null,
              metadataMonthly: meta?.nyesteMaanedsbeskaeftigelse
                ? { aar: meta.nyesteMaanedsbeskaeftigelse.aar, maaned: meta.nyesteMaanedsbeskaeftigelse.maaned, antalAnsatte: meta.nyesteMaanedsbeskaeftigelse.antalAnsatte }
                : null,
            },
          }
        : {}),
    };

    const response = json(payload, 200, {
      ...cors,
      // Browser/proxy cache hint (1 hour)
      "Cache-Control": "public, max-age=3600",
    });

    // Edge cache (1 hour) for non-debug
    if (!debug) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};

function latestRecord(arr, scoreFn) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.reduce((best, cur) => (scoreFn(cur) > scoreFn(best) ? cur : best));
}

function buildOutsetaAddress(a) {
  if (!a) return null;
  const street = [a.vejnavn, a.husnummerFra ?? a.husnummer, a.bogstavFra].filter(Boolean).join(" ");
  const floorDoor = [a.etage ? `${a.etage}.` : null, a.sidedoer].filter(Boolean).join(" ");
  const line1 = [street, floorDoor].filter(Boolean).join(", ") || a.adresseTekst || "";
  return {
    AddressLine1: line1,
    AddressLine2: "",
    City: a.postdistrikt || "",
    State: "",
    PostalCode: a.postnummer ? String(a.postnummer) : "",
    Country: "Denmark",
  };
}

function formatDkAddress(a) {
  if (!a) return null;
  if (a.adresseTekst) return a.adresseTekst;

  const street = [a.vejnavn, a.husnummerFra ?? a.husnummer, a.bogstavFra].filter(Boolean).join(" ");
  const floorDoor = [a.etage ? `${a.etage}.` : null, a.sidedoer].filter(Boolean).join(" ");
  const zipCity = [a.postnummer, a.postdistrikt].filter(Boolean).join(" ");

  const parts = [street, floorDoor, zipCity].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function withCors(response, cors) {
  // Ensure CORS headers are present even for cached responses
  const h = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(response.body, { status: response.status, headers: h });
}
