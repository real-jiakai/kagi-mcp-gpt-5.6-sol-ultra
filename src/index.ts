#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { LazyKagiSearcher } from "./kagi-client.js";
import { buildServer } from "./server.js";

function main(): void {
  serveStdio(() => buildServer(new LazyKagiSearcher()), {
    onerror: () => {
      console.error("The Kagi Session MCP server encountered a transport error.");
    },
  });
}

try {
  main();
} catch {
  console.error("The Kagi Session MCP server could not start.");
  process.exitCode = 1;
}
