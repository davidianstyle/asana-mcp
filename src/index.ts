#!/usr/bin/env node
import { program } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadAuth } from "./auth.js";
import { createServer } from "./server.js";

program
  .name("asana-mcp")
  .description("Asana MCP server for Claude Code")
  .requiredOption("--slug <slug>", "Asana account slug (e.g. personal, work)")
  .parse();

const opts = program.opts<{ slug: string }>();

const apiClient = loadAuth(opts.slug);
const server = createServer({ apiClient });
const transport = new StdioServerTransport();
await server.connect(transport);
