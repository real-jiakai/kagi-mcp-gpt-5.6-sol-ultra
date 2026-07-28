import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { RuntimeConfig } from "../src/config.js";
import { KagiSessionError } from "../src/errors.js";
import {
  KagiClient,
  type FetchImplementation,
} from "../src/kagi-client.js";
import type { SearchRequest } from "../src/types.js";

const fixtureUrl = new URL("./fixtures/search-results.html", import.meta.url);
const lensesFixtureUrl = new URL("./fixtures/lenses.html", import.meta.url);

const config: RuntimeConfig = {
  sessionToken: "super-secret-session-value",
  timeoutMs: 5_000,
  cacheTtlMs: 60_000,
  maxConcurrency: 2,
};

const baseRequest: SearchRequest = {
  query: "capital of japan",
  limit: 1,
  page: 1,
  timeRange: "week",
  sort: "recency",
  region: "us",
  lens: "programming",
  verbatim: true,
};

test("KagiClient uses the extension auth header and never puts the token in the URL", async () => {
  const html = await readFile(fixtureUrl, "utf8");
  let capturedUrl = "";
  let capturedHeaders = new Headers();

  const fetchImplementation: FetchImplementation = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  const client = new KagiClient(config, fetchImplementation);
  const response = await client.search(baseRequest);

  const requestUrl = new URL(capturedUrl);
  assert.equal(requestUrl.origin + requestUrl.pathname, "https://kagi.com/html/search");
  assert.equal(requestUrl.searchParams.get("q"), baseRequest.query);
  assert.equal(requestUrl.searchParams.get("dr"), "2");
  assert.equal(requestUrl.searchParams.get("order"), "2");
  assert.equal(requestUrl.searchParams.get("r"), "us");
  assert.equal(requestUrl.searchParams.get("lens"), "15");
  assert.equal(requestUrl.searchParams.get("verbatim"), "1");
  assert.equal(requestUrl.searchParams.has("l"), false);
  assert.equal(requestUrl.searchParams.has("token"), false);
  assert.equal(
    capturedHeaders.get("x-kagi-authorization"),
    config.sessionToken,
  );
  assert.equal(JSON.stringify(response).includes(config.sessionToken), false);
  assert.equal(response.returned, 1);
  assert.equal(response.pageResultCount, 2);
  assert.equal(response.truncated, true);
  assert.equal(response.hasMore, true);
  assert.equal(response.contentScope, "kagi_search_snippets");
  assert.equal(response.filters.lensId, 15);
});

test("KagiClient sends the explicit international default region", async () => {
  const html = await readFile(fixtureUrl, "utf8");
  let capturedUrl = "";
  const fetchImplementation: FetchImplementation = async (input) => {
    capturedUrl = String(input);
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };
  const client = new KagiClient(config, fetchImplementation);

  await client.search({
    ...baseRequest,
    region: "no_region",
  });

  assert.equal(new URL(capturedUrl).searchParams.get("r"), "no_region");
});

test("KagiClient uses different pagination parameters for Lens and ordinary searches", async () => {
  const html = await readFile(fixtureUrl, "utf8");
  const capturedUrls: string[] = [];
  const fetchImplementation: FetchImplementation = async (input) => {
    capturedUrls.push(String(input));
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };

  const lensClient = new KagiClient(config, fetchImplementation);
  await lensClient.search({
    ...baseRequest,
    page: 2,
    lens: 18_251,
  });

  const { lens: _ignoredLens, ...ordinaryRequest } = baseRequest;
  const ordinaryClient = new KagiClient(config, fetchImplementation);
  await ordinaryClient.search({
    ...ordinaryRequest,
    page: 2,
    region: "be_fr",
  });

  const lensUrl = new URL(capturedUrls[0] ?? "");
  assert.equal(lensUrl.searchParams.get("lens"), "18251");
  assert.equal(lensUrl.searchParams.get("page"), "2");
  assert.equal(lensUrl.searchParams.has("batch"), false);

  const ordinaryUrl = new URL(capturedUrls[1] ?? "");
  assert.equal(ordinaryUrl.searchParams.has("lens"), false);
  assert.equal(ordinaryUrl.searchParams.get("r"), "be_fr");
  assert.equal(ordinaryUrl.searchParams.get("batch"), "2");
  assert.equal(ordinaryUrl.searchParams.has("page"), false);
});

test("KagiClient discovers and briefly caches account Lenses without running a search", async () => {
  const html = await readFile(lensesFixtureUrl, "utf8");
  let fetchCount = 0;
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  const fetchImplementation: FetchImplementation = async (input, init) => {
    fetchCount += 1;
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };

  const client = new KagiClient(config, fetchImplementation);
  const first = await client.listLenses();
  const second = await client.listLenses();

  const requestUrl = new URL(capturedUrl);
  assert.equal(
    requestUrl.origin + requestUrl.pathname,
    "https://kagi.com/html/settings/lenses",
  );
  assert.equal(requestUrl.searchParams.has("token"), false);
  assert.equal(
    capturedHeaders.get("x-kagi-authorization"),
    config.sessionToken,
  );
  assert.equal(fetchCount, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.active[1]?.id, 18_251);
  assert.equal(first.inactive[0]?.name, "Small Web");
});

test("KagiClient caches a page across different output limits", async () => {
  const html = await readFile(fixtureUrl, "utf8");
  let fetchCount = 0;
  const fetchImplementation: FetchImplementation = async () => {
    fetchCount += 1;
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };

  const client = new KagiClient(config, fetchImplementation);
  const first = await client.search(baseRequest);
  const second = await client.search({ ...baseRequest, limit: 2 });

  assert.equal(fetchCount, 1);
  assert.equal(first.cached, false);
  assert.equal(first.pageResultCount, 2);
  assert.equal(first.truncated, true);
  assert.equal(first.hasMore, true);
  assert.equal(second.cached, true);
  assert.equal(second.returned, 2);
  assert.equal(second.pageResultCount, 2);
  assert.equal(second.truncated, false);
  assert.equal(second.hasMore, true);
});

test("KagiClient reports an expired session without leaking it", async () => {
  const fetchImplementation: FetchImplementation = async () =>
    new Response(null, {
      status: 302,
      headers: { location: "https://kagi.com/welcome" },
    });

  const client = new KagiClient(config, fetchImplementation);
  await assert.rejects(
    () => client.search(baseRequest),
    (error: unknown) =>
      error instanceof KagiSessionError &&
      error.code === "authentication" &&
      !error.publicMessage.includes(config.sessionToken),
  );
});

test("KagiClient surfaces bounded rate-limit guidance", async () => {
  const fetchImplementation: FetchImplementation = async () =>
    new Response(null, {
      status: 429,
      headers: { "retry-after": "12" },
    });

  const client = new KagiClient(config, fetchImplementation);
  await assert.rejects(
    () => client.search(baseRequest),
    (error: unknown) =>
      error instanceof KagiSessionError &&
      error.code === "rate_limited" &&
      error.publicMessage.includes("12 seconds") &&
      !error.publicMessage.includes(config.sessionToken),
  );
});
