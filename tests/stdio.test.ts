import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";

function createTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: process.cwd(),
    env: {
      ...getDefaultEnvironment(),
      KAGI_SESSION_TOKEN: "",
    },
    stderr: "pipe",
  });
}

async function exerciseExecutable(
  client: Client,
  expectedEra: "legacy" | "modern",
): Promise<void> {
  const transport = createTransport();
  await client.connect(transport);

  try {
    assert.equal(client.getProtocolEra(), expectedEra);

    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      ["kagi_search", "kagi_list_lenses"],
    );

    const result = await client.callTool({
      name: "kagi_search",
      arguments: { query: "configuration check" },
    });
    assert.equal(result.isError, true);
    assert.equal(
      JSON.stringify(result).includes("KAGI_SESSION_TOKEN is empty"),
      true,
    );

    if (expectedEra === "modern") {
      const discover = client.getDiscoverResult();
      assert.equal(discover?.ttlMs, 3_600_000);
      assert.equal(discover?.cacheScope, "public");
      assert.equal(listed.ttlMs, 3_600_000);
      assert.equal(listed.cacheScope, "public");
    }
  } finally {
    await client.close();
  }
}

test("the executable serves legacy MCP over clean stdio", async () => {
  const client = new Client({
    name: "kagi-session-mcp-legacy-stdio-tests",
    version: "0.2.0",
  });

  await exerciseExecutable(client, "legacy");
});

test("the executable serves MCP 2026-07-28 with cache hints", async () => {
  const client = new Client(
    {
      name: "kagi-session-mcp-modern-stdio-tests",
      version: "0.2.0",
    },
    {
      versionNegotiation: {
        mode: { pin: "2026-07-28" },
      },
    },
  );

  await exerciseExecutable(client, "modern");
});
