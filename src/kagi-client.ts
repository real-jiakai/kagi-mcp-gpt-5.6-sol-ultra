import { readRuntimeConfig, type RuntimeConfig } from "./config.js";
import { KagiSessionError } from "./errors.js";
import {
  parseKagiLensSettingsPage,
  parseKagiSearchPage,
} from "./parser.js";
import { resolveLensId } from "./types.js";
import type {
  KagiLensListResponse,
  KagiSearcher,
  KagiSearchResponse,
  SearchRequest,
} from "./types.js";

const KAGI_SEARCH_ENDPOINT = "https://kagi.com/html/search";
const KAGI_LENSES_ENDPOINT = "https://kagi.com/html/settings/lenses";
const USER_AGENT =
  "kagi-mcp-gpt-5.6-sol-ultra/0.2.0 (local personal search client)";
const MAX_CACHE_ENTRIES = 100;

const TIME_RANGE_PARAMETERS = {
  any: undefined,
  day: "1",
  week: "2",
  month: "3",
  year: "4",
} as const;

const SORT_PARAMETERS = {
  relevance: undefined,
  recency: "2",
  website: "3",
  ad_trackers: "4",
} as const;

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface CachedPage {
  expiresAt: number;
  response: KagiSearchResponse;
}

interface CachedLenses {
  expiresAt: number;
  response: KagiLensListResponse;
}

class ConcurrencyGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maximum: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }

    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

function buildSearchUrl(request: SearchRequest): URL {
  const url = new URL(KAGI_SEARCH_ENDPOINT);
  url.searchParams.set("q", request.query);

  if (request.page > 1) {
    url.searchParams.set(
      request.lens === undefined ? "batch" : "page",
      String(request.page),
    );
  }

  const timeRange = TIME_RANGE_PARAMETERS[request.timeRange];
  if (timeRange !== undefined) {
    url.searchParams.set("dr", timeRange);
  }

  const sort = SORT_PARAMETERS[request.sort];
  if (sort !== undefined) {
    url.searchParams.set("order", sort);
  }

  url.searchParams.set("r", request.region);

  if (request.lens !== undefined) {
    url.searchParams.set("lens", String(resolveLensId(request.lens)));
  }

  if (request.verbatim) {
    url.searchParams.set("verbatim", "1");
  }

  return url;
}

function responseForLimit(
  response: KagiSearchResponse,
  limit: number,
  cached: boolean,
): KagiSearchResponse {
  const results = response.results.slice(0, limit).map((result, index) => ({
    ...result,
    rank: index + 1,
  }));

  return {
    ...response,
    results,
    returned: results.length,
    truncated: results.length < response.pageResultCount,
    cached,
  };
}

export class KagiClient implements KagiSearcher {
  private readonly cache = new Map<string, CachedPage>();
  private readonly inFlight = new Map<string, Promise<KagiSearchResponse>>();
  private lensesCache: CachedLenses | undefined;
  private lensesInFlight: Promise<KagiLensListResponse> | undefined;
  private readonly gate: ConcurrencyGate;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly fetchImplementation: FetchImplementation = globalThis.fetch,
  ) {
    this.gate = new ConcurrencyGate(config.maxConcurrency);
  }

  async search(request: SearchRequest): Promise<KagiSearchResponse> {
    const url = buildSearchUrl(request);
    const cacheKey = url.toString();
    const now = Date.now();
    const cachedPage = this.cache.get(cacheKey);

    if (cachedPage !== undefined && cachedPage.expiresAt > now) {
      return responseForLimit(cachedPage.response, request.limit, true);
    }
    if (cachedPage !== undefined) {
      this.cache.delete(cacheKey);
    }

    const existingRequest = this.inFlight.get(cacheKey);
    if (existingRequest !== undefined) {
      const response = await existingRequest;
      return responseForLimit(response, request.limit, true);
    }

    const fullPageRequest: SearchRequest = {
      ...request,
      limit: 20,
    };
    const pending = this.gate.run(() =>
      this.fetchAndParse(url, fullPageRequest),
    );
    this.inFlight.set(cacheKey, pending);

    try {
      const response = await pending;
      if (this.config.cacheTtlMs > 0) {
        this.remember(cacheKey, response);
      }
      return responseForLimit(response, request.limit, false);
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  async listLenses(): Promise<KagiLensListResponse> {
    const now = Date.now();
    if (
      this.lensesCache !== undefined &&
      this.lensesCache.expiresAt > now
    ) {
      return {
        ...this.lensesCache.response,
        cached: true,
      };
    }
    this.lensesCache = undefined;

    if (this.lensesInFlight !== undefined) {
      const response = await this.lensesInFlight;
      return {
        ...response,
        cached: true,
      };
    }

    const pending = this.gate.run(async () => {
      const html = await this.fetchHtml(new URL(KAGI_LENSES_ENDPOINT));
      return parseKagiLensSettingsPage(html);
    });
    this.lensesInFlight = pending;

    try {
      const response = await pending;
      if (this.config.cacheTtlMs > 0) {
        this.lensesCache = {
          response,
          expiresAt: Date.now() + this.config.cacheTtlMs,
        };
      }
      return response;
    } finally {
      this.lensesInFlight = undefined;
    }
  }

  private remember(cacheKey: string, response: KagiSearchResponse): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }

    this.cache.delete(cacheKey);
    while (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.cache.delete(oldestKey);
    }

    this.cache.set(cacheKey, {
      response,
      expiresAt: now + this.config.cacheTtlMs,
    });
  }

  private async fetchAndParse(
    url: URL,
    request: SearchRequest,
  ): Promise<KagiSearchResponse> {
    const html = await this.fetchHtml(url);
    return parseKagiSearchPage(html, request);
  }

  private async fetchHtml(url: URL): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(this.config.timeoutMs),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": USER_AGENT,
          "X-Kagi-Authorization": this.config.sessionToken,
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new KagiSessionError(
          "timeout",
          `Kagi did not respond within ${this.config.timeoutMs} ms. Try again once.`,
          { retryable: true },
        );
      }

      throw new KagiSessionError(
        "upstream",
        "The local MCP server could not reach Kagi. Check the network connection and try again.",
        { retryable: true, cause: error },
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      if (/\b(welcome|signin)\b/i.test(location)) {
        throw new KagiSessionError(
          "authentication",
          "The Kagi session was rejected or expired. Create a new Session Link, update KAGI_SESSION_TOKEN, and restart the MCP server.",
        );
      }

      throw new KagiSessionError(
        "upstream",
        "Kagi returned an unexpected redirect. The HTML frontend may have changed.",
        { retryable: false },
      );
    }

    if (response.status === 401) {
      throw new KagiSessionError(
        "authentication",
        "The Kagi session was rejected or expired. Create a new Session Link, update KAGI_SESSION_TOKEN, and restart the MCP server.",
      );
    }

    if (response.status === 403) {
      throw new KagiSessionError(
        "forbidden",
        "Kagi rejected the request. The session may be expired, or Kagi may be blocking the current network address.",
      );
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const retryHint =
        retryAfter !== null && /^\d{1,5}$/.test(retryAfter)
          ? ` Wait ${retryAfter} seconds before trying again.`
          : " Wait before trying again.";
      throw new KagiSessionError(
        "rate_limited",
        `Kagi rate-limited the request.${retryHint}`,
        { retryable: true },
      );
    }

    if (!response.ok) {
      throw new KagiSessionError(
        "upstream",
        `Kagi returned HTTP ${response.status}. Try again later.`,
        { retryable: response.status >= 500 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new KagiSessionError(
        "parser_changed",
        "Kagi returned an unexpected response format. The HTML frontend may have changed.",
      );
    }

    const declaredLength = Number(
      response.headers.get("content-length") ?? "0",
    );
    if (Number.isFinite(declaredLength) && declaredLength > 3_000_000) {
      throw new KagiSessionError(
        "parser_changed",
        "Kagi returned an unexpectedly large page. The HTML frontend may have changed.",
      );
    }

    return response.text();
  }
}

export class LazyKagiSearcher implements KagiSearcher {
  private client: KagiClient | undefined;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImplementation: FetchImplementation = globalThis.fetch,
  ) {}

  search(request: SearchRequest): Promise<KagiSearchResponse> {
    this.client ??= new KagiClient(
      readRuntimeConfig(this.env),
      this.fetchImplementation,
    );
    return this.client.search(request);
  }

  listLenses(): Promise<KagiLensListResponse> {
    this.client ??= new KagiClient(
      readRuntimeConfig(this.env),
      this.fetchImplementation,
    );
    return this.client.listLenses();
  }
}
