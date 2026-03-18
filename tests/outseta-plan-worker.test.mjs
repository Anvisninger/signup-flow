import test from "node:test";
import assert from "node:assert/strict";

import worker from "../packages/workers/outseta-plan-worker/src/index.js";
import { createCacheMock } from "./helpers/cache-mock.test-helper.mjs";

const ALLOWED_ORIGIN = "https://anvisninger.dk";

function createCtx() {
  return { waitUntil: (promise) => promise };
}

test("Outseta plan worker rejects disallowed origins", async () => {
  globalThis.caches = { default: createCacheMock() };

  const request = new Request("https://example.com/check-email?email=test@example.com", {
    method: "GET",
    headers: { Origin: "https://evil.example" },
  });

  const response = await worker.fetch(request, {}, createCtx());
  assert.equal(response.status, 403);
});

test("Outseta plan worker validates email input", async () => {
  globalThis.caches = { default: createCacheMock() };

  const request = new Request("https://example.com/check-email?email=invalid", {
    method: "GET",
    headers: { Origin: ALLOWED_ORIGIN },
  });

  const response = await worker.fetch(request, {}, createCtx());
  assert.equal(response.status, 400);
});

test("Outseta plan worker progressively rate limits check-email", async () => {
  globalThis.caches = { default: createCacheMock() };

  const request = new Request("https://example.com/check-email?email=test@example.com", {
    method: "GET",
    headers: {
      Origin: ALLOWED_ORIGIN,
      "CF-Connecting-IP": "198.51.100.15",
      "User-Agent": "test-agent",
    },
  });

  const fetchBackup = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const first = await worker.fetch(
      request,
      { OUTSETA_API_KEY: "x", OUTSETA_API_SECRET: "y" },
      createCtx()
    );
    const second = await worker.fetch(
      request,
      { OUTSETA_API_KEY: "x", OUTSETA_API_SECRET: "y" },
      createCtx()
    );
    const third = await worker.fetch(
      request,
      { OUTSETA_API_KEY: "x", OUTSETA_API_SECRET: "y" },
      createCtx()
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
  } finally {
    globalThis.fetch = fetchBackup;
  }
});
