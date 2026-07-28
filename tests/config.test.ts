import assert from "node:assert/strict";
import test from "node:test";

import { extractSessionToken, readRuntimeConfig } from "../src/config.js";
import { KagiSessionError } from "../src/errors.js";

test("extractSessionToken accepts a raw token", () => {
  assert.equal(extractSessionToken("  raw-token_123  "), "raw-token_123");
});

test("extractSessionToken accepts a complete Kagi Session Link", () => {
  assert.equal(
    extractSessionToken(
      "https://kagi.com/search?token=session-value&q=%s",
    ),
    "session-value",
  );
});
test("extractSessionToken rejects deceptive or non-Kagi hosts", () => {
  for (const value of [
    "https://evilkagi.com/search?token=secret",
    "https://kagi.com.example/search?token=secret",
    "http://kagi.com/search?token=secret",
  ]) {
    assert.throws(
      () => extractSessionToken(value),
      (error: unknown) =>
        error instanceof KagiSessionError &&
        error.code === "configuration" &&
        !error.publicMessage.includes("secret"),
    );
  }
});

test("readRuntimeConfig validates runtime bounds without exposing the token", () => {
  assert.throws(
    () =>
      readRuntimeConfig({
        KAGI_SESSION_TOKEN: "private-session-value",
        KAGI_MAX_CONCURRENCY: "99",
      }),
    (error: unknown) =>
      error instanceof KagiSessionError &&
      error.code === "configuration" &&
      !error.publicMessage.includes("private-session-value"),
  );
});
