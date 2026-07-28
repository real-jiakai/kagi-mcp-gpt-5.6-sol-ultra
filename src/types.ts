export const TIME_RANGES = ["any", "day", "week", "month", "year"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export const SORT_ORDERS = [
  "relevance",
  "recency",
  "website",
  "ad_trackers",
] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const KNOWN_LENS_NAMES = [
  "academic",
  "forums",
  "programming",
  "news_360",
  "recipes",
  "small_web",
  "pdfs",
  "fediverse_forums",
  "usenet_archive",
  "kagi_documentation",
  "cyber_security",
  "jobs",
] as const;
export type KnownLensName = (typeof KNOWN_LENS_NAMES)[number];

export const KNOWN_LENS_IDS: Readonly<Record<KnownLensName, number>> = {
  academic: 2,
  forums: 1,
  programming: 15,
  news_360: 29,
  recipes: 120,
  small_web: 107,
  pdfs: 3,
  fediverse_forums: 4248,
  usenet_archive: 5648,
  kagi_documentation: 3271,
  cyber_security: 4583,
  jobs: 19487,
};

export type LensSelection = KnownLensName | number;
export const DEFAULT_REGION = "no_region";

export function resolveLensId(lens: LensSelection): number {
  return typeof lens === "number" ? lens : KNOWN_LENS_IDS[lens];
}

export interface SearchRequest {
  query: string;
  limit: number;
  page: number;
  timeRange: TimeRange;
  sort: SortOrder;
  verbatim: boolean;
  region: string;
  lens?: LensSelection;
}

export interface AppliedSearchFilters {
  timeRange: TimeRange;
  sort: SortOrder;
  verbatim: boolean;
  region: string;
  lensId?: number;
}

export interface KagiSearchResult {
  rank: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt?: string;
}

export interface KagiSearchResponse extends Record<string, unknown> {
  query: string;
  page: number;
  returned: number;
  pageResultCount: number;
  truncated: boolean;
  cached: boolean;
  hasMore: boolean;
  contentScope: "kagi_search_snippets";
  filters: AppliedSearchFilters;
  results: KagiSearchResult[];
  relatedQueries: string[];
  totalEstimate?: number;
  elapsedMs?: number;
}

export interface KagiLens {
  id: number;
  name: string;
  description: string;
  active: boolean;
}

export interface KagiLensListResponse extends Record<string, unknown> {
  active: KagiLens[];
  inactive: KagiLens[];
  cached: boolean;
}

export interface KagiSearcher {
  search(request: SearchRequest): Promise<KagiSearchResponse>;
  listLenses(): Promise<KagiLensListResponse>;
}
