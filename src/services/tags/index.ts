import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Asana from "asana";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerTagsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const tags = () => new Asana.TagsApi(ctx.apiClient);

  server.tool(
    "asana_get_tags_for_workspace",
    "List tags in a workspace",
    {
      workspace: z.string().describe("Workspace GID"),
    },
    async ({ workspace }) => {
      const res = await tags().getTagsForWorkspace(workspace, {});
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_get_tags_for_task",
    "List tags on a task",
    {
      task_id: z.string().describe("Task GID"),
    },
    async ({ task_id }) => {
      const res = await tags().getTagsForTask(task_id, {});
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_get_tag",
    "Get details of a tag",
    {
      tag_id: z.string().describe("Tag GID"),
    },
    async ({ tag_id }) => {
      const res = await tags().getTag(tag_id, {});
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_create_tag_for_workspace",
    "Create a new tag in a workspace",
    {
      workspace: z.string().describe("Workspace GID"),
      name: z.string().describe("Tag name"),
      color: z.string().optional().describe("Tag color"),
    },
    async ({ workspace, name, color }) => {
      const res = await tags().createTagForWorkspace({ data: { name, color } }, workspace);
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_update_tag",
    "Update a tag's name or color",
    {
      tag_id: z.string().describe("Tag GID"),
      name: z.string().optional().describe("New tag name"),
      color: z.string().optional().describe("New tag color"),
    },
    async ({ tag_id, ...updates }) => {
      const res = await tags().updateTag({ data: updates }, tag_id);
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_delete_tag",
    "Delete a tag",
    {
      tag_id: z.string().describe("Tag GID to delete"),
    },
    async ({ tag_id }) => {
      await tags().deleteTag(tag_id);
      return textResult({ ok: true, deleted: tag_id });
    }
  );
}
