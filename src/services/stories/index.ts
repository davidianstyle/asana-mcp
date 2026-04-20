import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Asana from "asana";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerStoriesTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const stories = () => new Asana.StoriesApi(ctx.apiClient);

  server.tool(
    "asana_get_task_stories",
    "Get comments and activity on a task",
    {
      task_id: z.string().describe("Task GID"),
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    async ({ task_id, opt_fields }) => {
      const res = await stories().getStoriesForTask(task_id, {
        opt_fields: (opt_fields || "text,created_by.name,created_at,type,resource_subtype").split(","),
      });
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_create_task_story",
    "Add a comment to a task",
    {
      task_id: z.string().describe("Task GID"),
      text: z.string().describe("Comment text"),
    },
    async ({ task_id, text }) => {
      const res = await stories().createStoryForTask({ data: { text } }, task_id);
      return textResult(res.data);
    }
  );
}
