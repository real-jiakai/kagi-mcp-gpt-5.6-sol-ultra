import { KagiSessionError } from "./errors.js";

export interface RuntimeConfig {
  sessionToken: string;
  timeoutMs: number;
  cacheTtlMs: number;
  maxConcurrency: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MAX_CONCURRENCY = 2;

function configurationError(message: string): KagiSessionError {
  return new KagiSessionError("configuration", message);
}

function validateRawToken(token: string): string {
  const normalized = token.trim();

  if (normalized.length === 0) {
    throw configurationError(
      "KAGI_SESSION_TOKEN is empty. Set it to a raw token or a complete Kagi Session Link.",
    );
  }

  if (normalized.length > 4096 || /\s/.test(normalized)) {
    throw configurationError(
      "KAGI_SESSION_TOKEN is malformed. Use the raw token or the complete Kagi Session Link.",
    );
  }

  return normalized;
}

export function extractSessionToken(value: string | undefined): string {
  if (value === undefined) {
    throw configurationError(
      "KAGI_SESSION_TOKEN is not configured. Set it locally, restart the MCP server, and try again.",
    );
  }

  const normalized = value.trim();
  if (!normalized.includes("://")) {
    return validateRawToken(normalized);
  }

  let sessionLink: URL;
  try {
    sessionLink = new URL(normalized);
  } catch {
    throw configurationError(
      "KAGI_SESSION_TOKEN looks like a URL but is not a valid Kagi Session Link.",
    );
  }

  if (sessionLink.protocol !== "https:" || sessionLink.hostname !== "kagi.com") {
    throw configurationError(
      "A Kagi Session Link must use the exact https://kagi.com host.",
    );
  }

  const token = sessionLink.searchParams.get("token");
  if (token === null) {
    throw configurationError(
      "The Kagi Session Link does not contain a token parameter.",
    );
  }

  return validateRawToken(token);
}

function integerFromEnvironment(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = env[name];
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw configurationError(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

export function readRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return {
    sessionToken: extractSessionToken(
      env.KAGI_SESSION_TOKEN ?? env.KAGI_SESSION_LINK,
    ),
    timeoutMs: integerFromEnvironment(
      env,
      "KAGI_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      1_000,
      30_000,
    ),
    cacheTtlMs: integerFromEnvironment(
      env,
      "KAGI_CACHE_TTL_MS",
      DEFAULT_CACHE_TTL_MS,
      0,
      600_000,
    ),
    maxConcurrency: integerFromEnvironment(
      env,
      "KAGI_MAX_CONCURRENCY",
      DEFAULT_MAX_CONCURRENCY,
      1,
      4,
    ),
  };
}
