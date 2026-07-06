import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Asana from "asana";
import { z } from "zod";
import { ServiceContext } from "../../types.js";
import { textResult } from "../../utils/formatting.js";
import { withErrorHandling } from "../../utils/errors.js";
import { parseOptFields } from "../../utils/optFields.js";
import { limitParam, offsetParam, paginationOpts, pagedResult } from "../../utils/pagination.js";
import { mapSearchFilterParams } from "./searchFilterMap.js";
import {
  dateField,
  datetimeField,
  nullableDateField,
  nullableDatetimeField,
  clearNullSentinel,
  assertMutuallyExclusive,
  assertExactlyOneOf,
} from "./validation.js";

// The generated .d.ts for searchTasksForWorkspace omits `limit` even though Asana's
// docs ("Page sizes are limited to a maximum of 100 items, and can be specified by
// the limit query parameter") and the JS implementation (queryParams = opts, spread
// through verbatim — see node_modules/asana/src/api/TasksApi.js) both support it.
type SearchTasksOpts = NonNullable<
  Parameters<InstanceType<typeof Asana.TasksApi>["searchTasksForWorkspace"]>[1]
>;

export function registerTasksTools(
  server: McpServer,
  ctx: ServiceContext
): void {
  const tasks = () => new Asana.TasksApi(ctx.apiClient);
  const sections = () => new Asana.SectionsApi(ctx.apiClient);

  server.tool(
    "asana_search_tasks",
    "Search tasks with advanced filters",
    {
      workspace: z.string().describe("Workspace GID"),
      text: z.string().optional().describe("Full-text search query"),
      assignee_any: z.string().optional().describe("Comma-separated user GIDs or 'me'"),
      due_on_before: z.string().optional().describe("Due date upper bound (YYYY-MM-DD)"),
      due_on_after: z.string().optional().describe("Due date lower bound (YYYY-MM-DD)"),
      due_on: z.string().optional().describe("Exact due date (YYYY-MM-DD)"),
      completed: z.boolean().optional().describe("Filter by completion status"),
      completed_on: z.string().optional().describe("Completed on date (YYYY-MM-DD)"),
      modified_on_after: z.string().optional().describe("Modified after (YYYY-MM-DD)"),
      projects_any: z.string().optional().describe("Comma-separated project GIDs"),
      sections_any: z.string().optional().describe("Comma-separated section GIDs"),
      tags_any: z.string().optional().describe("Comma-separated tag GIDs"),
      sort_by: z.enum(["due_date", "created_at", "completed_at", "modified_at"]).optional().describe("Sort field"),
      sort_ascending: z.boolean().optional().describe("Sort direction"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Max results (1-100). Asana caps search results at 100 server-side and does not support traditional offset pagination for this endpoint — re-run with a narrower filter (e.g. modified_on_after) to see more."
        ),
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async (params) => {
      const { workspace, opt_fields, limit, ...filterParams } = params;
      const searchQuery: SearchTasksOpts & { limit?: number } = {
        ...mapSearchFilterParams(filterParams),
        opt_fields: parseOptFields(
          opt_fields,
          "name,due_on,completed,assignee.name,projects.name,permalink_url,resource_subtype,num_subtasks,parent.name"
        ),
      };
      if (limit !== undefined) searchQuery.limit = limit;
      const res = await tasks().searchTasksForWorkspace(workspace, searchQuery);
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_get_task",
    "Get full details of a task",
    {
      task_id: z.string().describe("Task GID"),
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async ({ task_id, opt_fields }) => {
      const res = await tasks().getTask(task_id, {
        opt_fields: parseOptFields(
          opt_fields,
          "name,notes,due_on,due_at,completed,assignee.name,projects.name,tags.name,custom_fields.name,custom_fields.display_value,permalink_url,parent.name,num_subtasks"
        ),
      });
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_get_multiple_tasks_by_gid",
    "Get details for up to 25 tasks by GID",
    {
      task_ids: z.array(z.string()).max(25).describe("Array of task GIDs (max 25)"),
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async ({ task_ids, opt_fields }) => {
      const fields = parseOptFields(
        opt_fields,
        "name,due_on,completed,assignee.name,projects.name,permalink_url,resource_subtype,num_subtasks,parent.name"
      );
      const results = await Promise.all(
        task_ids.map((id) => tasks().getTask(id, { opt_fields: fields }).then((r) => r.data))
      );
      return textResult(results);
    })
  );

  server.tool(
    "asana_get_my_tasks",
    "Get tasks assigned to the authenticated user",
    {
      workspace: z.string().describe("Workspace GID"),
      completed_since: z.string().optional().describe("Only incomplete tasks or tasks completed since this date ('now' for incomplete only)"),
      limit: limitParam,
      offset: offsetParam,
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async ({ workspace, completed_since, limit, offset, opt_fields }) => {
      const res = await tasks().getTasks({
        workspace,
        assignee: "me",
        completed_since: completed_since || "now",
        ...paginationOpts(limit, offset),
        opt_fields: parseOptFields(
          opt_fields,
          "name,due_on,due_at,completed,projects.name,permalink_url,resource_subtype,num_subtasks,parent.name"
        ),
      });
      return textResult(pagedResult(res));
    })
  );

  server.tool(
    "asana_get_tasks_for_project",
    "Get tasks in a project",
    {
      project_id: z.string().describe("Project GID"),
      limit: limitParam,
      offset: offsetParam,
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async ({ project_id, limit, offset, opt_fields }) => {
      const res = await tasks().getTasksForProject(project_id, {
        ...paginationOpts(limit, offset),
        opt_fields: parseOptFields(
          opt_fields,
          "name,due_on,completed,assignee.name,permalink_url,resource_subtype,num_subtasks,parent.name,memberships.section.name"
        ),
      });
      return textResult(pagedResult(res));
    })
  );

  server.tool(
    "asana_get_tasks_for_tag",
    "Get tasks with a specific tag",
    {
      tag_id: z.string().describe("Tag GID"),
      limit: limitParam,
      offset: offsetParam,
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async ({ tag_id, limit, offset, opt_fields }) => {
      const res = await tasks().getTasksForTag(tag_id, {
        ...paginationOpts(limit, offset),
        opt_fields: parseOptFields(
          opt_fields,
          "name,due_on,completed,assignee.name,permalink_url,resource_subtype,num_subtasks,parent.name"
        ),
      });
      return textResult(pagedResult(res));
    })
  );

  server.tool(
    "asana_create_task",
    "Create a new task",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project GID to create the task in. Provide exactly one of project_id or workspace."),
      workspace: z
        .string()
        .optional()
        .describe(
          "Workspace GID for an untargeted task — lands in the creator's My Tasks list (useful for quick GTD-style capture before triaging into a project). Provide exactly one of project_id or workspace."
        ),
      name: z.string().describe("Task name"),
      notes: z.string().optional().describe("Task description"),
      html_notes: z.string().optional().describe("HTML-formatted task description"),
      due_on: dateField().optional().describe("Due date (YYYY-MM-DD). Mutually exclusive with due_at."),
      due_at: datetimeField()
        .optional()
        .describe("Due date and time, ISO 8601 UTC (e.g. 2026-01-15T09:00:00Z). Mutually exclusive with due_on."),
      start_on: dateField().optional().describe("Start date (YYYY-MM-DD). Mutually exclusive with start_at."),
      start_at: datetimeField()
        .optional()
        .describe("Start date and time, ISO 8601 UTC. Mutually exclusive with start_on."),
      assignee: z.string().optional().describe("Assignee GID or 'me'"),
      parent: z.string().optional().describe("Parent task GID"),
      projects: z.array(z.string()).optional().describe("Additional project GIDs"),
      custom_fields: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Custom field GID→value map. Setting this at create time avoids a separate create-then-update round trip."
        ),
      resource_subtype: z
        .enum(["default_task", "milestone", "approval"])
        .optional()
        .describe(
          "Task subtype. 'default_task' is the standard unit of work; 'milestone' renders with a diamond icon and is the right call for project-level outcomes; 'approval' renders approve/reject actions instead of a checkbox — pair with asana_update_task's approval_status to record the decision. Mutable via asana_update_task."
        ),
    },
    withErrorHandling(async ({ project_id, workspace, projects: extraProjects, ...taskData }) => {
      assertExactlyOneOf({ project_id, workspace }, ["project_id", "workspace"]);
      assertMutuallyExclusive(taskData, [
        ["due_on", "due_at"],
        ["start_on", "start_at"],
      ]);

      const body: Record<string, unknown> = { ...taskData };
      if (project_id !== undefined) {
        body.projects = [project_id, ...(extraProjects || [])];
      } else {
        body.workspace = workspace;
        if (extraProjects && extraProjects.length > 0) body.projects = extraProjects;
      }

      const res = await tasks().createTask({ data: body });
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_update_task",
    "Update an existing task",
    {
      task_id: z.string().describe("Task GID to update"),
      name: z.string().optional().describe("New task name"),
      notes: z.string().optional().describe("New description"),
      html_notes: z.string().optional().describe("New HTML description"),
      due_on: nullableDateField().describe(
        'New due date (YYYY-MM-DD). Pass null (or the string "null") to clear it. Mutually exclusive with due_at.'
      ),
      due_at: nullableDatetimeField().describe(
        'New due date and time, ISO 8601 UTC. Pass null (or "null") to clear it. Mutually exclusive with due_on.'
      ),
      start_on: nullableDateField().describe(
        'New start date (YYYY-MM-DD). Pass null (or "null") to clear it. Mutually exclusive with start_at.'
      ),
      start_at: nullableDatetimeField().describe(
        'New start date and time, ISO 8601 UTC. Pass null (or "null") to clear it. Mutually exclusive with start_on.'
      ),
      assignee: z.string().optional().describe("New assignee GID or 'me'"),
      completed: z.boolean().optional().describe("Mark as completed or not"),
      approval_status: z
        .enum(["pending", "approved", "rejected", "changes_requested"])
        .optional()
        .describe(
          "Approval decision, for tasks with resource_subtype 'approval'. Kept in sync with completed — approved/rejected/changes_requested all mark it complete."
        ),
      custom_fields: z.record(z.string(), z.unknown()).optional().describe("Custom field GID→value map"),
      resource_subtype: z
        .enum(["default_task", "milestone", "approval"])
        .optional()
        .describe(
          "Convert between task subtypes. Pass 'milestone' to mark a row as a milestone (diamond icon, used for project-level outcomes); 'approval' for an approve/reject task; 'default_task' converts back to a standard task. Mutation preserves gid, custom fields, subtasks, stories, and project membership."
        ),
    },
    withErrorHandling(async ({ task_id, due_on, due_at, start_on, start_at, ...rest }) => {
      assertMutuallyExclusive({ due_on, due_at, start_on, start_at }, [
        ["due_on", "due_at"],
        ["start_on", "start_at"],
      ]);

      const updates: Record<string, unknown> = { ...rest };
      if (due_on !== undefined) updates.due_on = clearNullSentinel(due_on);
      if (due_at !== undefined) updates.due_at = clearNullSentinel(due_at);
      if (start_on !== undefined) updates.start_on = clearNullSentinel(start_on);
      if (start_at !== undefined) updates.start_at = clearNullSentinel(start_at);

      const res = await tasks().updateTask({ data: updates }, task_id);
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_delete_task",
    "Delete a task permanently",
    {
      task_id: z.string().describe("Task GID to delete"),
    },
    withErrorHandling(async ({ task_id }) => {
      await tasks().deleteTask(task_id);
      return textResult({ ok: true, deleted: task_id });
    })
  );

  server.tool(
    "asana_create_subtask",
    "Create a subtask under a parent task",
    {
      parent_task_id: z.string().describe("Parent task GID"),
      name: z.string().describe("Subtask name"),
      notes: z.string().optional().describe("Subtask description"),
      html_notes: z.string().optional().describe("HTML-formatted subtask description"),
      due_on: dateField().optional().describe("Due date (YYYY-MM-DD). Mutually exclusive with due_at."),
      due_at: datetimeField()
        .optional()
        .describe("Due date and time, ISO 8601 UTC. Mutually exclusive with due_on."),
      assignee: z.string().optional().describe("Assignee GID or 'me'"),
      resource_subtype: z
        .enum(["default_task", "milestone", "approval"])
        .optional()
        .describe("Subtask subtype — see asana_create_task for details. Mutable via asana_update_task."),
    },
    withErrorHandling(async ({ parent_task_id, ...taskData }) => {
      assertMutuallyExclusive(taskData, [["due_on", "due_at"]]);
      const res = await tasks().createSubtaskForTask({ data: taskData }, parent_task_id);
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_get_subtasks",
    "Get subtasks of a task",
    {
      task_id: z.string().describe("Parent task GID"),
      limit: limitParam,
      offset: offsetParam,
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async ({ task_id, limit, offset, opt_fields }) => {
      const res = await tasks().getSubtasksForTask(task_id, {
        ...paginationOpts(limit, offset),
        opt_fields: parseOptFields(
          opt_fields,
          "name,due_on,completed,assignee.name,resource_subtype,num_subtasks,parent.name"
        ),
      });
      return textResult(pagedResult(res));
    })
  );

  server.tool(
    "asana_add_task_dependencies",
    "Set tasks that this task depends on",
    {
      task_id: z.string().describe("Task GID"),
      dependencies: z.array(z.string()).describe("GIDs of tasks this depends on"),
    },
    withErrorHandling(async ({ task_id, dependencies }) => {
      const res = await tasks().addDependenciesForTask({ data: { dependencies } }, task_id);
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_add_task_dependents",
    "Set tasks that depend on this task",
    {
      task_id: z.string().describe("Task GID"),
      dependents: z.array(z.string()).describe("GIDs of tasks that depend on this one"),
    },
    withErrorHandling(async ({ task_id, dependents }) => {
      const res = await tasks().addDependentsForTask({ data: { dependents } }, task_id);
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_add_project_to_task",
    "Add a task to a project",
    {
      task_id: z.string().describe("Task GID"),
      project_id: z.string().describe("Project GID to add the task to"),
      section: z.string().optional().describe("Section GID within the project"),
    },
    withErrorHandling(async ({ task_id, project_id, section }) => {
      await tasks().addProjectForTask({ data: { project: project_id, section } }, task_id);
      return textResult({ ok: true });
    })
  );

  server.tool(
    "asana_remove_project_from_task",
    "Remove a task from a project",
    {
      task_id: z.string().describe("Task GID"),
      project_id: z.string().describe("Project GID to remove the task from"),
    },
    withErrorHandling(async ({ task_id, project_id }) => {
      await tasks().removeProjectForTask({ data: { project: project_id } }, task_id);
      return textResult({ ok: true });
    })
  );

  server.tool(
    "asana_add_tag_to_task",
    "Add a tag to a task",
    {
      task_id: z.string().describe("Task GID"),
      tag_id: z.string().describe("Tag GID to add"),
    },
    withErrorHandling(async ({ task_id, tag_id }) => {
      await tasks().addTagForTask({ data: { tag: tag_id } }, task_id);
      return textResult({ ok: true });
    })
  );

  server.tool(
    "asana_remove_tag_from_task",
    "Remove a tag from a task",
    {
      task_id: z.string().describe("Task GID"),
      tag_id: z.string().describe("Tag GID to remove"),
    },
    withErrorHandling(async ({ task_id, tag_id }) => {
      await tasks().removeTagForTask({ data: { tag: tag_id } }, task_id);
      return textResult({ ok: true });
    })
  );

  server.tool(
    "asana_add_task_to_section",
    "Move a task to a section within a project",
    {
      section_id: z.string().describe("Section GID"),
      task_id: z.string().describe("Task GID to move"),
      insert_before: z.string().optional().describe("Task GID to insert before"),
      insert_after: z.string().optional().describe("Task GID to insert after"),
    },
    withErrorHandling(async ({ section_id, task_id, insert_before, insert_after }) => {
      await sections().addTaskForSection(section_id, { body: { data: { task: task_id, insert_before, insert_after } } });
      return textResult({ ok: true });
    })
  );

  server.tool(
    "asana_set_parent_for_task",
    "Set or change a task's parent",
    {
      task_id: z.string().describe("Task GID"),
      parent: z.string().describe("New parent task GID (empty string to remove parent)"),
    },
    withErrorHandling(async ({ task_id, parent }) => {
      const res = await tasks().setParentForTask({ data: { parent: parent || null } }, task_id);
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_add_followers",
    "Add followers (collaborators/watchers) to a task. Followers receive notifications about the task without being the assignee. Accepts user GIDs — resolve names or emails to GIDs with asana_typeahead.",
    {
      task_id: z.string().describe("Task GID"),
      followers: z.array(z.string()).min(1).describe("User GIDs (or 'me') to add as followers"),
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async ({ task_id, followers, opt_fields }) => {
      const res = await tasks().addFollowersForTask({ data: { followers } }, task_id, {
        opt_fields: parseOptFields(opt_fields, "name,followers.name"),
      });
      return textResult(res.data);
    })
  );

  server.tool(
    "asana_remove_followers",
    "Remove followers (collaborators/watchers) from a task. Accepts user GIDs — resolve names or emails to GIDs with asana_typeahead.",
    {
      task_id: z.string().describe("Task GID"),
      followers: z.array(z.string()).min(1).describe("User GIDs (or 'me') to remove as followers"),
      opt_fields: z.string().optional().describe("Comma-separated fields to include"),
    },
    withErrorHandling(async ({ task_id, followers, opt_fields }) => {
      const res = await tasks().removeFollowerForTask({ data: { followers } }, task_id, {
        opt_fields: parseOptFields(opt_fields, "name,followers.name"),
      });
      return textResult(res.data);
    })
  );
}
