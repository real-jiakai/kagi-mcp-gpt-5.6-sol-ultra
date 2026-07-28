import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

test("the executable speaks MCP over clean stdio", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: process.cwd(),
    env: {
      ...getDefaultEnvironment(),
      KAGI_SESSION_TOKEN: "",
    },
    stderr: "pipe",
  });
  const client = new Client({
    name: "kagi-session-mcp-stdio-tests",
    version: "0.1.0",
  });

  await client.connect(transport);

  try {
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
  } finally {
    await client.close();
  }
});
