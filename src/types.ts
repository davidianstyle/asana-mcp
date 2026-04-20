import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Asana from "asana";

export interface ServiceContext {
  apiClient: Asana.ApiClient;
}

export type RegisterTools = (server: McpServer, ctx: ServiceContext) => void;
