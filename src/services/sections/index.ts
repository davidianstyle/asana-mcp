import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Asana from "asana";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerSectionsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const sections = () => new Asana.SectionsApi(ctx.apiClient);

  server.tool(
    "asana_get_project_sections",
    "List sections in a project",
    {
      project_id: z.string().describe("Project GID"),
    },
    async ({ project_id }) => {
      const res = await sections().getSectionsForProject(project_id, {});
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_create_section",
    "Create a new section in a project",
    {
      project_id: z.string().describe("Project GID"),
      name: z.string().describe("Section name"),
      insert_before: z.string().optional().describe("Section GID to insert before"),
      insert_after: z.string().optional().describe("Section GID to insert after"),
    },
    async ({ project_id, name, insert_before, insert_after }) => {
      const res = await sections().createSectionForProject(project_id, { body: { data: { name, insert_before, insert_after } } });
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_update_section",
    "Update a section (rename)",
    {
      section_id: z.string().describe("Section GID"),
      name: z.string().describe("New section name"),
    },
    async ({ section_id, name }) => {
      const res = await sections().updateSection(section_id, { body: { data: { name } } });
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_delete_section",
    "Delete a section from a project",
    {
      section_id: z.string().describe("Section GID to delete"),
    },
    async ({ section_id }) => {
      await sections().deleteSection(section_id);
      return textResult({ ok: true, deleted: section_id });
    }
  );
}
