import { load } from "cheerio";

import { KagiSessionError } from "./errors.js";
import type {
  KagiLens,
  KagiLensListResponse,
  KagiSearchResponse,
  KagiSearchResult,
  SearchRequest,
} from "./types.js";
import { resolveLensId } from "./types.js";

const MAX_HTML_BYTES = 3_000_000;
const MAX_PARSED_RESULTS = 20;
const MAX_SNIPPET_CHARACTERS = 1_200;
const MAX_LENS_DESCRIPTION_CHARACTERS = 600;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateAtWord(value: string, maximum: number): string {
  if (value.length <= maximum) {
    return value;
  }

  const candidate = value.slice(0, maximum - 1);
  const finalSpace = candidate.lastIndexOf(" ");
  const end = finalSpace >= maximum * 0.7 ? finalSpace : candidate.length;
  return `${candidate.slice(0, end).trimEnd()}…`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function elapsedMilliseconds(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  if (normalized.endsWith("ms")) {
    return Math.round(number);
  }

  if (normalized.endsWith("s")) {
    return Math.round(number * 1_000);
  }

  return undefined;
}

function looksLikeAuthenticationPage(
  title: string,
  bodyText: string,
  signInControlCount: number,
): boolean {
  return (
    /\b(sign in|welcome)\b.*\bkagi\b/i.test(title) ||
    signInControlCount > 0 ||
    /\bsign in to (?:use|continue with) kagi\b/i.test(bodyText)
  );
}

function looksLikeEmptyResultPage(mainText: string): boolean {
  return (
    /\bno (?:search )?results (?:found|available)\b/i.test(mainText) ||
    /\bwe (?:could not|couldn't) find\b/i.test(mainText) ||
    /\bdid not match any (?:documents|results)\b/i.test(mainText)
  );
}

export function parseKagiSearchPage(
  html: string,
  request: SearchRequest,
): KagiSearchResponse {
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new KagiSessionError(
      "parser_changed",
      "Kagi returned an unexpectedly large page. The HTML frontend may have changed.",
    );
  }

  const $ = load(html);
  const title = normalizeWhitespace($("title").first().text());
  const bodyText = normalizeWhitespace($("body").text()).slice(0, 10_000);
  const signInControlCount = $(
    'form[action*="signin"], a[href^="/signin"], a[href*="/signin?"]',
  ).length;

  if (looksLikeAuthenticationPage(title, bodyText, signInControlCount)) {
    throw new KagiSessionError(
      "authentication",
      "The Kagi session was rejected or expired. Create a new Session Link, update KAGI_SESSION_TOKEN, and restart the MCP server.",
    );
  }

  if (
    request.lens !== undefined &&
    $('[aria-label^="Deactivate lens"]').length === 0
  ) {
    throw new KagiSessionError(
      "filter_rejected",
      `Kagi did not activate Lens ID ${resolveLensId(request.lens)}. Call kagi_list_lenses and choose an active Lens, or activate it in Kagi settings.`,
    );
  }

  const resultNodes = $("main .search-result");
  const parsedResults: KagiSearchResult[] = [];
  const seenUrls = new Set<string>();

  resultNodes.each((_, element) => {
    if (parsedResults.length >= MAX_PARSED_RESULTS) {
      return false;
    }

    const card = $(element);
    const titleLink = card
      .find("a.__sri_title_link, h3 a[href]")
      .first();
    const url = titleLink.attr("href")?.trim() ?? "";
    const resultTitle = normalizeWhitespace(titleLink.text());

    if (
      resultTitle.length === 0 ||
      !isHttpUrl(url) ||
      seenUrls.has(url)
    ) {
      return;
    }

    const publishedAt = normalizeWhitespace(
      card.find(".__sri-time").first().text(),
    );
    const snippetNode = card.find(".__sri-desc").first().clone();
    snippetNode
      .find(".__sri-time, .summarize-link, script, style")
      .remove();
    const snippet = truncateAtWord(
      normalizeWhitespace(snippetNode.text()),
      MAX_SNIPPET_CHARACTERS,
    );

    let domain =
      titleLink.attr("data-domain")?.trim() ??
      normalizeWhitespace(card.find(".host").first().text());
    if (domain.length === 0) {
      domain = new URL(url).hostname;
    }

    seenUrls.add(url);
    parsedResults.push({
      rank: parsedResults.length + 1,
      title: resultTitle,
      url,
      domain,
      snippet,
      ...(publishedAt.length > 0 ? { publishedAt } : {}),
    });
  });

  const mainText = normalizeWhitespace($("main").text());
  if (parsedResults.length === 0 && !looksLikeEmptyResultPage(mainText)) {
    throw new KagiSessionError(
      "parser_changed",
      resultNodes.length > 0
        ? "Kagi returned result cards in an unrecognized format. The local parser needs an update."
        : "Kagi returned no recognized result cards. The session may be invalid or the HTML frontend may have changed.",
    );
  }

  const metadataValues = $(".results_meta i")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get();
  const totalCandidate = Number.parseInt(
    (metadataValues[0] ?? "").replace(/[^\d]/g, ""),
    10,
  );
  const elapsedMs = elapsedMilliseconds(metadataValues[1] ?? "");

  const relatedQueries: string[] = [];
  const seenRelated = new Set<string>();
  $(".related-searches a").each((_, element) => {
    const query = normalizeWhitespace($(element).text());
    if (
      query.length > 0 &&
      query.length <= 300 &&
      !seenRelated.has(query) &&
      relatedQueries.length < 8
    ) {
      seenRelated.add(query);
      relatedQueries.push(query);
    }
  });

  let hasMore = false;
  const paginationParameter =
    request.lens === undefined ? "batch" : "page";
  $(`a[href*="${paginationParameter}="]`).each((_, element) => {
    const href = $(element).attr("href");
    if (href === undefined) {
      return;
    }

    try {
      const target = new URL(href, "https://kagi.com");
      const nextPage = Number.parseInt(
        target.searchParams.get(paginationParameter) ?? "",
        10,
      );
      if (Number.isInteger(nextPage) && nextPage > request.page) {
        hasMore = true;
      }
    } catch {
      // Ignore malformed navigation links from the upstream HTML.
    }
  });

  const limitedResults = parsedResults.slice(0, request.limit);
  const filters = {
    timeRange: request.timeRange,
    sort: request.sort,
    verbatim: request.verbatim,
    region: request.region,
    ...(request.lens === undefined
      ? {}
      : { lensId: resolveLensId(request.lens) }),
  };

  return {
    query: request.query,
    page: request.page,
    returned: limitedResults.length,
    pageResultCount: parsedResults.length,
    truncated: limitedResults.length < parsedResults.length,
    cached: false,
    hasMore,
    contentScope: "kagi_search_snippets",
    filters,
    results: limitedResults,
    relatedQueries,
    ...(Number.isFinite(totalCandidate)
      ? { totalEstimate: totalCandidate }
      : {}),
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
  };
}

export function parseKagiLensSettingsPage(
  html: string,
): KagiLensListResponse {
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new KagiSessionError(
      "parser_changed",
      "Kagi returned an unexpectedly large Lens settings page. The HTML frontend may have changed.",
    );
  }

  const $ = load(html);
  const title = normalizeWhitespace($("title").first().text());
  const bodyText = normalizeWhitespace($("body").text()).slice(0, 10_000);
  const signInControlCount = $(
    'form[action*="signin"], a[href^="/signin"], a[href*="/signin?"]',
  ).length;

  if (looksLikeAuthenticationPage(title, bodyText, signInControlCount)) {
    throw new KagiSessionError(
      "authentication",
      "The Kagi session was rejected or expired. Create a new Session Link, update KAGI_SESSION_TOKEN, and restart the MCP server.",
    );
  }

  const active: KagiLens[] = [];
  const inactive: KagiLens[] = [];
  const seenIds = new Set<number>();

  const parseGroup = (selector: string, isActive: boolean): void => {
    $(`${selector} .__lens_item`).each((_, element) => {
      const item = $(element);
      const id = Number.parseInt(
        item.attr("data-id") ??
          item.find('input[name="lens_id"]').first().attr("value") ??
          "",
        10,
      );
      const name = normalizeWhitespace(
        item.find(".lens_title > div").first().text(),
      );
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        seenIds.has(id) ||
        name.length === 0 ||
        name.length > 200
      ) {
        return;
      }

      const description = truncateAtWord(
        normalizeWhitespace(item.find(".lens_desc").first().text()),
        MAX_LENS_DESCRIPTION_CHARACTERS,
      );
      const lens: KagiLens = {
        id,
        name,
        description,
        active: isActive,
      };

      seenIds.add(id);
      (isActive ? active : inactive).push(lens);
    });
  };

  parseGroup('[id$="_lens_table_active"]', true);
  parseGroup('[id$="_lens_table_inactive"]', false);

  if (active.length === 0 && inactive.length === 0) {
    throw new KagiSessionError(
      "parser_changed",
      "Kagi returned no recognizable Lens settings. The local parser needs an update.",
    );
  }

  return {
    active,
    inactive,
    cached: false,
  };
}
