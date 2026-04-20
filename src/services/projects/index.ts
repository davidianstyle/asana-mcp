import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Asana from "asana";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";

export function registerProjectsTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const workspaces = () => new Asana.WorkspacesApi(ctx.apiClient);
  const projects = () => new Asana.ProjectsApi(ctx.apiClient);
  const statuses = () => new Asana.ProjectStatusesApi(ctx.apiClient);

  server.tool(
    "asana_list_workspaces",
    "List all workspaces the authenticated user belongs to",
    {},
    async () => {
      const res = await workspaces().getWorkspaces({});
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_search_projects",
    "Search for projects by name pattern",
    {
      workspace: z.string().describe("Workspace GID"),
      name_pattern: z.string().describe("Regex pattern to match project names"),
      archived: z.boolean().optional().default(false).describe("Only return archived projects"),
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    async ({ workspace, name_pattern, archived, opt_fields }) => {
      const res = await projects().getProjectsForWorkspace(workspace, {
        archived,
        opt_fields: (opt_fields || "name,archived,color,current_status").split(","),
      });
      const regex = new RegExp(name_pattern, "i");
      const matches = (res.data || []).filter((p: Record<string, unknown>) =>
        regex.test(p.name as string)
      );
      return textResult(matches);
    }
  );

  server.tool(
    "asana_get_project",
    "Get detailed information about a project",
    {
      project_id: z.string().describe("Project GID"),
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    async ({ project_id, opt_fields }) => {
      const res = await projects().getProject(project_id, {
        opt_fields: (opt_fields || "name,notes,archived,color,current_status,owner.name,team.name,permalink_url").split(","),
      });
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_create_project",
    "Create a new project in a workspace",
    {
      workspace: z.string().describe("Workspace GID"),
      name: z.string().describe("Project name"),
      notes: z.string().optional().describe("Project description"),
      color: z.string().optional().describe("Project color"),
      team: z.string().optional().describe("Team GID"),
    },
    async ({ workspace, ...projectData }) => {
      const res = await projects().createProjectForWorkspace({ data: projectData }, workspace);
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_update_project",
    "Update a project's details",
    {
      project_id: z.string().describe("Project GID"),
      name: z.string().optional().describe("New project name"),
      notes: z.string().optional().describe("New description"),
      archived: z.boolean().optional().describe("Archive or unarchive"),
      color: z.string().optional().describe("New color"),
    },
    async ({ project_id, ...updates }) => {
      const res = await projects().updateProject({ data: updates }, project_id);
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_get_project_task_counts",
    "Get task counts for a project",
    {
      project_id: z.string().describe("Project GID"),
    },
    async ({ project_id }) => {
      const res = await projects().getProject(project_id, {
        opt_fields: ["name", "num_tasks", "num_incomplete_tasks"],
      });
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_get_project_statuses",
    "List status updates for a project",
    {
      project_id: z.string().describe("Project GID"),
    },
    async ({ project_id }) => {
      const res = await statuses().getProjectStatusesForProject(project_id, {});
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_get_project_status",
    "Get a specific project status update",
    {
      status_id: z.string().describe("Project status GID"),
    },
    async ({ status_id }) => {
      const res = await statuses().getProjectStatus(status_id, {});
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_create_project_status",
    "Create a status update for a project",
    {
      project_id: z.string().describe("Project GID"),
      text: z.string().describe("Status text"),
      color: z.enum(["green", "yellow", "red"]).describe("Status color"),
      title: z.string().optional().describe("Status title"),
    },
    async ({ project_id, ...statusData }) => {
      const res = await statuses().createProjectStatusForProject({ data: statusData }, project_id);
      return textResult(res.data);
    }
  );

  server.tool(
    "asana_delete_project_status",
    "Delete a project status update",
    {
      status_id: z.string().describe("Project status GID"),
    },
    async ({ status_id }) => {
      await statuses().deleteProjectStatus(status_id);
      return textResult({ ok: true, deleted: status_id });
    }
  );
}
