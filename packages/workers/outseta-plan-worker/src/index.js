export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/plans") {
      return handlePlans(url, env, corsHeaders);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};

async function handlePlans(url, env, corsHeaders) {
  const employeesParam = url.searchParams.get("employees");
  const employees =
    employeesParam != null && employeesParam !== ""
      ? Number(employeesParam)
      : null;

  if (employeesParam != null && (!Number.isFinite(employees) || employees < 0)) {
    return json({ error: "Invalid employees parameter" }, 400, corsHeaders);
  }

  const planFamilyName = "OffentligtUdbud - Prismodel 2026";

  const endpoint = "https://anvisninger.outseta.com/api/v1/billing/planfamilies";

  const res = await fetchOutseta(endpoint, env);

  if (!res.ok) {
    const text = await res.text();
    return json(
      { error: `Outseta error (${res.status})`, details: text.slice(0, 500) },
      res.status,
      corsHeaders
    );
  }

  const raw = await res.json();

  const family = (raw?.items || []).find((pf) => pf?.Name === planFamilyName);

  if (!family) {
    return json(
      {
        error: `PlanFamily not found: ${planFamilyName}`,
        availablePlanFamilies: (raw?.items || [])
          .map((x) => x?.Name)
          .filter(Boolean),
      },
      404,
      corsHeaders
    );
  }

  const plans = (family?.Plans || [])
    .filter((p) => p && p.IsActive !== false)
    .map((p) => ({
      planUid: p?.Uid ?? null,
      name: p?.Name ?? null,
      annualRate: Number(p?.AnnualRate),
      maximumPeople: p?.MaximumPeople == null ? null : Number(p.MaximumPeople),
    }))
    .filter((p) => p.planUid && p.name)
    .sort((a, b) => {
      if (a.maximumPeople == null) return 1;
      if (b.maximumPeople == null) return -1;
      return a.maximumPeople - b.maximumPeople;
    });

  let selectedPlan = null;

  if (employees != null) {
    for (const p of plans) {
      if (p.maximumPeople != null && employees <= p.maximumPeople) {
        selectedPlan = p;
        break;
      }
    }

    if (!selectedPlan) {
      selectedPlan =
        plans.find((p) => p.maximumPeople == null) ||
        plans[plans.length - 1] ||
        null;
    }
  }

  return json(
    {
      planFamilyName,
      plans,
      ...(employees != null ? { employees, plan: selectedPlan } : {}),
    },
    200,
    corsHeaders
  );
}

async function fetchOutseta(endpoint, env) {
  const authHeader = `Outseta ${env.OUTSETA_API_KEY}:${env.OUTSETA_API_SECRET}`;

  return fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
