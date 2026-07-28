import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { KagiSessionError } from "../src/errors.js";
import {
  parseKagiLensSettingsPage,
  parseKagiSearchPage,
} from "../src/parser.js";
import type { SearchRequest } from "../src/types.js";

const requestWithoutLens: SearchRequest = {
  query: "capital of japan",
  limit: 10,
  page: 1,
  timeRange: "any",
  sort: "relevance",
  region: "no_region",
  verbatim: false,
};
const request: SearchRequest = {
  ...requestWithoutLens,
  region: "us",
  lens: "programming",
};

const fixtureUrl = new URL("./fixtures/search-results.html", import.meta.url);
const lensesFixtureUrl = new URL("./fixtures/lenses.html", import.meta.url);

test("parseKagiSearchPage returns compact structured results", async () => {
  const html = await readFile(fixtureUrl, "utf8");
  const response = parseKagiSearchPage(html, request);

  assert.equal(response.query, request.query);
  assert.equal(response.returned, 2);
  assert.equal(response.pageResultCount, 2);
  assert.equal(response.truncated, false);
  assert.equal(response.totalEstimate, 22);
  assert.equal(response.elapsedMs, 1_380);
  assert.equal(response.hasMore, true);
  assert.equal(response.contentScope, "kagi_search_snippets");
  assert.deepEqual(response.filters, {
    timeRange: "any",
    sort: "relevance",
    verbatim: false,
    region: "us",
    lensId: 15,
  });
  assert.deepEqual(response.relatedQueries, [
    "capital of japan before tokyo",
    "capital of japan before kyoto",
  ]);
  assert.deepEqual(response.results[0], {
    rank: 1,
    title: "Capital of Japan",
    url: "https://en.wikipedia.org/wiki/Capital_of_Japan",
    domain: "en.wikipedia.org",
    snippet: "The capital of Japan is Tokyo. The oldest capital is Nara.",
    publishedAt: "Jul 22, 2025",
  });
  assert.equal(response.results[1]?.domain, "britannica.com");
});

test("parseKagiSearchPage distinguishes local truncation from upstream pagination", async () => {
  const html = await readFile(fixtureUrl, "utf8");
  const htmlWithoutNextPage = html.replace(
    "page=2",
    "page=1",
  );
  const response = parseKagiSearchPage(htmlWithoutNextPage, {
    ...request,
    limit: 1,
  });

  assert.equal(response.returned, 1);
  assert.equal(response.pageResultCount, 2);
  assert.equal(response.truncated, true);
  assert.equal(response.hasMore, false);
  assert.equal(response.results.length, 1);
});

test("parseKagiSearchPage treats a sign-in page as an auth failure", () => {
  assert.throws(
    () =>
      parseKagiSearchPage(
        "<html><head><title>Sign in - Kagi</title></head><body><form action='/signin'></form></body></html>",
        requestWithoutLens,
      ),
    (error: unknown) =>
      error instanceof KagiSessionError && error.code === "authentication",
  );
});

test("parseKagiSearchPage fails closed when result markup changes", () => {
  assert.throws(
    () =>
      parseKagiSearchPage(
        "<html><head><title>query - Kagi Search</title></head><body><main><article>Unknown result markup</article></main></body></html>",
        requestWithoutLens,
      ),
    (error: unknown) =>
      error instanceof KagiSessionError && error.code === "parser_changed",
  );
});

test("parseKagiSearchPage accepts an explicit empty-results page", () => {
  const response = parseKagiSearchPage(
    "<html><head><title>query - Kagi Search</title></head><body><main>No search results found.</main></body></html>",
    requestWithoutLens,
  );

  assert.equal(response.returned, 0);
  assert.equal(response.pageResultCount, 0);
  assert.equal(response.truncated, false);
  assert.equal(response.contentScope, "kagi_search_snippets");
  assert.deepEqual(response.results, []);
});

test("parseKagiSearchPage fails closed when Kagi ignores a requested Lens", () => {
  assert.throws(
    () =>
      parseKagiSearchPage(
        "<html><head><title>query - Kagi Search</title></head><body><main>No search results found.</main></body></html>",
        {
          ...requestWithoutLens,
          lens: 107,
        },
      ),
    (error: unknown) =>
      error instanceof KagiSessionError &&
      error.code === "filter_rejected" &&
      error.publicMessage.includes("107"),
  );
});

test("parseKagiLensSettingsPage returns active and inactive Lens IDs", async () => {
  const html = await readFile(lensesFixtureUrl, "utf8");
  const response = parseKagiLensSettingsPage(html);

  assert.equal(response.cached, false);
  assert.deepEqual(response.active, [
    {
      id: 15,
      name: "Programming",
      description: "Official programming language websites and forums.",
      active: true,
    },
    {
      id: 18_251,
      name: "My Research",
      description: "A private custom research lens.",
      active: true,
    },
  ]);
  assert.deepEqual(response.inactive, [
    {
      id: 107,
      name: "Small Web",
      description: "Results that favor noncommercial domains and topics.",
      active: false,
    },
  ]);
});
