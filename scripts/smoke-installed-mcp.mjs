import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
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
const query = process.env.KAGI_SMOKE_QUERY ?? "gemini 3.5 pro";
const limit = Number.parseInt(process.env.KAGI_SMOKE_LIMIT ?? "20", 10);
const page = Number.parseInt(process.env.KAGI_SMOKE_PAGE ?? "1", 10);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [launcherPath],
  cwd: projectDirectory,
  env: getDefaultEnvironment(),
  stderr: "pipe",
});
const client = new Client({
  name: "kagi-session-mcp-installed-smoke-test",
  version: "0.1.0",
});

await client.connect(transport);

try {
  const listed = await client.listTools();
  const result = await client.callTool({
    name: "kagi_search",
    arguments: {
      query,
      limit,
      page,
    },
  });

  console.log(
    JSON.stringify(
      {
        tools: listed.tools.map((tool) => tool.name),
        result,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
