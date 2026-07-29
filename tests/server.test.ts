import assert from "node:assert/strict";
import test from "node:test";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { buildServer } from "../src/server.js";
import { resolveLensId } from "../src/types.js";
import type {
  KagiSearcher,
  KagiSearchResponse,
  SearchRequest,
} from "../src/types.js";

test("the MCP contract exposes compact search and Lens discovery tools", async () => {
  let capturedRequest: SearchRequest | undefined;
  const searcher: KagiSearcher = {
    async search(request): Promise<KagiSearchResponse> {
      capturedRequest = request;
      return {
        query: request.query,
        page: request.page,
        returned: 1,
        pageResultCount: 1,
        truncated: false,
        cached: false,
        hasMore: true,
        contentScope: "kagi_search_snippets",
        filters: {
          timeRange: request.timeRange,
          sort: request.sort,
          verbatim: request.verbatim,
          region: request.region,
          ...(request.lens === undefined
            ? {}
            : { lensId: resolveLensId(request.lens) }),
        },
        results: [
          {
            rank: 1,
            title: "Model Context Protocol",
            url: "https://modelcontextprotocol.io/",
            domain: "modelcontextprotocol.io",
            snippet: "An open protocol for connecting AI applications to tools.",
          },
        ],
        relatedQueries: [],
        totalEstimate: 1,
        elapsedMs: 42,
      };
    },
    async listLenses() {
      return {
        active: [
          {
            id: 15,
            name: "Programming",
            description: "Programming sources.",
            active: true,
          },
        ],
        inactive: [],
        cached: false,
      };
    },
  };

  const server = buildServer(searcher);
  const client = new Client({
    name: "kagi-session-mcp-tests",
    version: "0.2.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 2);
    assert.equal(listed.tools[0]?.name, "kagi_search");
    assert.equal(listed.tools[1]?.name, "kagi_list_lenses");
    assert.equal(listed.tools[0]?.annotations?.readOnlyHint, true);
    assert.equal(listed.tools[0]?.annotations?.openWorldHint, true);
    assert.equal(
      listed.tools[0]?.inputSchema.properties?.query !== undefined,
      true,
    );
    assert.equal(
      listed.tools[0]?.inputSchema.properties?.lens !== undefined,
      true,
    );
    const regionInputSchema = listed.tools[0]?.inputSchema.properties?.region as
      | { default?: unknown }
      | undefined;
    assert.equal(
      regionInputSchema?.default,
      "no_region",
    );

    const result = await client.callTool({
      name: "kagi_search",
      arguments: {
        query: "Model Context Protocol",
        lens: "programming",
        region: "ca_fr",
      },
    });

    assert.equal(result.isError, undefined);
    assert.deepEqual(capturedRequest, {
      query: "Model Context Protocol",
      limit: 20,
      page: 1,
      timeRange: "any",
      sort: "relevance",
      region: "ca_fr",
      lens: "programming",
      verbatim: false,
    });
    const structuredContent = result.structuredContent as
      | Record<string, unknown>
      | undefined;
    assert.equal(structuredContent?.returned, 1);
    assert.equal(structuredContent?.pageResultCount, 1);
    assert.equal(structuredContent?.truncated, false);
    assert.equal(structuredContent?.hasMore, true);
    assert.equal(
      structuredContent?.contentScope,
      "kagi_search_snippets",
    );
    assert.equal(Array.isArray(result.content), true);
    const content = result.content as Array<{
      type?: unknown;
      text?: unknown;
    }>;
    assert.equal(
      content.some(
        (item) =>
          item.type === "text" &&
          typeof item.text === "string" &&
          item.text.includes("# Kagi Search") &&
          item.text.includes("## 1. Model Context Protocol") &&
          item.text.includes(
            "- **Kagi snippet:** An open protocol for connecting AI applications to tools.",
          ) &&
          item.text.includes(
            "**Content scope:** Kagi search-result snippets; destination pages were not fetched.",
          ) &&
          item.text.includes(
            "More results are available: call `kagi_search` again with `page: 2`.",
          ),
      ),
      true,
    );

    await client.callTool({
      name: "kagi_search",
      arguments: {
        query: "International search",
      },
    });
    assert.equal(capturedRequest?.region, "no_region");

    const lensesResult = await client.callTool({
      name: "kagi_list_lenses",
      arguments: {},
    });
    assert.equal(lensesResult.isError, undefined);
    const lensContent = lensesResult.structuredContent as
      | Record<string, unknown>
      | undefined;
    assert.equal(
      Array.isArray(lensContent?.active) &&
        (lensContent.active as Array<{ id?: unknown }>)[0]?.id === 15,
      true,
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test("the MCP contract sanitizes unexpected backend errors", async () => {
  const secret = "must-not-escape";
  const searcher: KagiSearcher = {
    async search() {
      throw new Error(`backend included ${secret}`);
    },
    async listLenses() {
      throw new Error(`backend included ${secret}`);
    },
  };

  const server = buildServer(searcher);
  const client = new Client({
    name: "kagi-session-mcp-tests",
    version: "0.2.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const result = await client.callTool({
      name: "kagi_search",
      arguments: { query: "test" },
    });
    assert.equal(result.isError, true);
    assert.equal(JSON.stringify(result).includes(secret), false);
  } finally {
    await client.close();
    await server.close();
  }
});
