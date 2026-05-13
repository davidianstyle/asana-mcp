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
      color: z
        .string()
        .optional()
        .describe(
          "Project icon color. Asana's project palette uses light- / dark- prefixes — valid values include: light-pink, light-green, light-blue, light-red, light-teal, light-brown, light-orange, light-purple, light-warm-gray, dark-pink, dark-green, dark-blue, dark-red, dark-teal, dark-brown, dark-orange, dark-purple, dark-warm-gray, none. Note: this is a DIFFERENT palette than enum-option colors (those are red/blue/blue-green/etc. without prefixes)."
        ),
      team: z.string().optional().describe("Team GID"),
      privacy_setting: z
        .enum(["public_to_workspace", "private_to_team", "private"])
        .optional()
        .describe(
          "Project visibility. public_to_workspace = anyone in the workspace can view (best for cross-functional boards). private_to_team = team members only. private = explicit members only. Defaults to private if omitted."
        ),
      default_view: z
        .enum(["list", "board", "calendar", "timeline"])
        .optional()
        .describe("Default view mode when opening the project. Defaults to list if omitted."),
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
      color: z
        .string()
        .optional()
        .describe(
          "New project icon color. Valid values: light-pink, light-green, light-blue, light-red, light-teal, light-brown, light-orange, light-purple, light-warm-gray, dark-pink, dark-green, dark-blue, dark-red, dark-teal, dark-brown, dark-orange, dark-purple, dark-warm-gray, none. (Different palette from enum-option colors.)"
        ),
      privacy_setting: z
        .enum(["public_to_workspace", "private_to_team", "private"])
        .optional()
        .describe("Project visibility. public_to_workspace makes the project readable by anyone in the workspace."),
      default_view: z
        .enum(["list", "board", "calendar", "timeline"])
        .optional()
        .describe("Default view mode when opening the project."),
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
