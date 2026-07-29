import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const launcherPath = resolve(
  projectDirectory,
  "scripts",
  "run-with-session-token.mjs",
);
const query = process.env.KAGI_SMOKE_QUERY?.trim() || "gemini 3.5 pro";
const limit = 20;
const maxPages = 10;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSearchPage(result, page) {
  if (result.isError === true) {
    throw new Error(`kagi_search returned an error on page ${page}.`);
  }

  const structured = result.structuredContent;
  if (
    !isRecord(structured) ||
    !Array.isArray(structured.results) ||
    typeof structured.hasMore !== "boolean"
  ) {
    throw new Error(
      `kagi_search returned invalid structured content on page ${page}.`,
    );
  }

  for (const item of structured.results) {
    if (!isRecord(item) || typeof item.url !== "string") {
      throw new Error(
        `kagi_search returned an invalid result on page ${page}.`,
      );
    }
  }

  return structured;
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [launcherPath],
  cwd: projectDirectory,
  env: getDefaultEnvironment(),
  stderr: "pipe",
});
const client = new Client({
  name: "kagi-session-mcp-installed-pagination-smoke",
  version: "0.2.0",
});

let connected = false;

try {
  await client.connect(transport);
  connected = true;

  const seenUrls = new Set();
  const results = [];
  const pages = [];
  let pagesFetched = 0;
  let cardsReturned = 0;
  let hasMore = true;

  for (let page = 1; page <= maxPages && hasMore; page += 1) {
    const response = await client.callTool({
      name: "kagi_search",
      arguments: {
        query,
        limit,
        page,
      },
    });
    const structured = readSearchPage(response, page);

    pagesFetched += 1;
    hasMore = structured.hasMore;
    cardsReturned += structured.results.length;
    pages.push({
      page,
      returned: structured.returned,
      pageResultCount: structured.pageResultCount,
      truncated: structured.truncated,
      hasMore: structured.hasMore,
      ...(typeof structured.totalEstimate === "number"
        ? { totalEstimate: structured.totalEstimate }
        : {}),
      ...(typeof structured.elapsedMs === "number"
        ? { elapsedMs: structured.elapsedMs }
        : {}),
    });

    for (const item of structured.results) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        const { rank: pageRank, ...result } = item;
        results.push({
          rank: results.length + 1,
          page,
          pageRank,
          ...result,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        query,
        pagesFetched,
        hasMore,
        cardsReturned,
        uniqueResultCount: results.length,
        duplicatesRemoved: cardsReturned - results.length,
        pages,
        results,
      },
      null,
      2,
    ),
  );
} catch {
  process.stderr.write(
    "Installed Kagi MCP pagination smoke test failed without exposing credentials.\n",
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    await client.close().catch(() => undefined);
  } else {
    await transport.close().catch(() => undefined);
  }
}
