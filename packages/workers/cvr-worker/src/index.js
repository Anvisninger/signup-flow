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

    // Address
    const addr =
      meta?.nyesteBeliggenhedsadresse ||
      company?.beliggenhedsadresse?.[0] ||
      meta?.nyestePostadresse ||
      company?.postadresse?.[0] ||
      null;

    const address = formatDkAddress(addr);
    const addressObject = buildOutsetaAddress(addr);

    // Employees + source (stable, explicit)
    const monthly = meta?.nyesteMaanedsbeskaeftigelse?.antalAnsatte;
    const annual = meta?.nyesteAarsbeskaeftigelse?.antalAnsatte;
    const quarterly = meta?.nyesteKvartalsbeskaeftigelse?.antalAnsatte;

    let employees = null;
    let employeesSource = "none";

    if (monthly != null) {
      employees = monthly;
      employeesSource = "monthly";
    } else if (annual != null) {
      employees = annual;
      employeesSource = "annual";
    } else if (quarterly != null) {
      employees = quarterly;
      employeesSource = "quarterly";
    }

    const payload = {
      cvr,
      name,
      address,
      addressObject,
      employees,
      employeesSource,
      ...(debug
        ? {
            debug: {
              companyStatus: companyRes.status,
              usedEmployeesFrom:
                employeesSource === "monthly"
                  ? "virksomhedMetadata.nyesteMaanedsbeskaeftigelse.antalAnsatte"
                  : employeesSource === "annual"
                    ? "virksomhedMetadata.nyesteAarsbeskaeftigelse.antalAnsatte"
                    : employeesSource === "quarterly"
                      ? "virksomhedMetadata.nyesteKvartalsbeskaeftigelse.antalAnsatte"
                      : "none",
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
