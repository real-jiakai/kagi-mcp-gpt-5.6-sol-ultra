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
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(projectDirectory, "dist", "index.js")],
  cwd: projectDirectory,
  env: {
    ...getDefaultEnvironment(),
    KAGI_SESSION_TOKEN: "",
  },
  stderr: "pipe",
});
const client = new Client(
  {
    name: "kagi-session-mcp-compiled-validation",
    version: "0.2.0",
  },
  {
    versionNegotiation: {
      mode: { pin: "2026-07-28" },
    },
  },
);

await client.connect(transport);

try {
  if (client.getProtocolEra() !== "modern") {
    throw new Error("The compiled server did not negotiate modern MCP.");
  }

  const discover = client.getDiscoverResult();
  if (
    discover?.ttlMs !== 3_600_000 ||
    discover.cacheScope !== "public"
  ) {
    throw new Error(
      "The compiled server exposed unexpected discovery cache hints.",
    );
  }

  const listed = await client.listTools();
  const toolNames = listed.tools.map((tool) => tool.name).sort();
  if (
    toolNames.length !== 2 ||
    toolNames[0] !== "kagi_list_lenses" ||
    toolNames[1] !== "kagi_search"
  ) {
    throw new Error("The compiled server exposed an unexpected tool list.");
  }
  if (listed.ttlMs !== 3_600_000 || listed.cacheScope !== "public") {
    throw new Error(
      "The compiled server exposed unexpected tool cache hints.",
    );
  }

  const result = await client.callTool({
    name: "kagi_search",
    arguments: { query: "configuration check" },
  });
  if (result.isError !== true) {
    throw new Error(
      "The compiled server did not handle missing configuration safely.",
    );
  }

  console.log("Compiled modern stdio MCP validation passed.");
} finally {
  await client.close();
}
