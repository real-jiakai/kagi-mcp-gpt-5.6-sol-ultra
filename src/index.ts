#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { LazyKagiSearcher } from "./kagi-client.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const server = buildServer(new LazyKagiSearcher());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => {
  console.error("The Kagi Session MCP server could not start.");
  process.exitCode = 1;
});
