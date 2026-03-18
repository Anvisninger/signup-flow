import test from "node:test";
import assert from "node:assert/strict";

import worker from "../packages/workers/cvr-worker/src/index.js";
import { createCacheMock } from "./helpers/cache-mock.test-helper.mjs";

const ALLOWED_ORIGIN = "https://anvisninger.dk";

function createCtx() {
  return { waitUntil: (promise) => promise };
}

test("CVR worker rejects disallowed origins", async () => {
  globalThis.caches = { default: createCacheMock() };

  const request = new Request("https://example.com/cvr?cvr=12345678", {
    method: "GET",
    headers: { Origin: "https://evil.example" },
  });

  const response = await worker.fetch(request, { CVR_DEV_API_KEY: "x" }, createCtx());

  assert.equal(response.status, 403);
});

test("CVR worker validates CVR format", async () => {
  globalThis.caches = { default: createCacheMock() };

  const request = new Request("https://example.com/cvr?cvr=12", {
    method: "GET",
    headers: { Origin: ALLOWED_ORIGIN },
  });

  const response = await worker.fetch(request, { CVR_DEV_API_KEY: "x" }, createCtx());
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /8 cifre/i);
});

test("CVR worker rate limits rapid repeated requests", async () => {
  globalThis.caches = { default: createCacheMock() };

  const request = new Request("https://example.com/cvr?cvr=12345678", {
    method: "GET",
    headers: {
      Origin: ALLOWED_ORIGIN,
      "CF-Connecting-IP": "203.0.113.10",
      "User-Agent": "test-agent",
    },
  });

  const fetchBackup = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    if (urlText.includes("/virksomhed?")) {
      return new Response(
        JSON.stringify([
          {
            virksomhedMetadata: { nyesteNavn: { navn: "Firma" } },
            maanedsbeskaeftigelse: [],
            kvartalsbeskaeftigelse: [],
            aarsbeskaeftigelse: [],
          },
        ]),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ ansatte: [] }), { status: 200 });
  };

  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await worker.fetch(request, { CVR_DEV_API_KEY: "x" }, createCtx());
      assert.notEqual(response.status, 429);
    }

    const throttled = await worker.fetch(request, { CVR_DEV_API_KEY: "x" }, createCtx());
    assert.equal(throttled.status, 429);
    assert.ok(throttled.headers.get("Retry-After"));
  } finally {
    globalThis.fetch = fetchBackup;
  }
});
