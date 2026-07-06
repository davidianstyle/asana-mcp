// Asana's task-search endpoint (`GET /workspaces/{gid}/tasks/search`) expects several
// filter parameters in dot notation (e.g. `assignee.any`), not underscore notation
// (`assignee_any`). Our tool schema keeps the underscore names (MCP tool params can't
// contain dots as easily and we don't want to break existing callers), so this map
// renames them just before the SDK call.
//
// Verified against node_modules/asana/src/api/TasksApi.js searchTasksForWorkspace
// JSDoc (opts.assignee.any, opts.due_on.before, opts.due_on.after, opts.modified_on.after,
// opts.projects.any, opts.sections.any, opts.tags.any).
const SEARCH_FILTER_RENAME_MAP: Record<string, string> = {
  assignee_any: "assignee.any",
  due_on_before: "due_on.before",
  due_on_after: "due_on.after",
  modified_on_after: "modified_on.after",
  projects_any: "projects.any",
  sections_any: "sections.any",
  tags_any: "tags.any",
};

/**
 * Renames underscore-notation search filter keys to the dot notation Asana's
 * search endpoint requires. Keys with no mapping entry pass through unchanged.
 * Keys whose value is `undefined` are dropped.
 */
export function mapSearchFilterParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const mappedKey = SEARCH_FILTER_RENAME_MAP[key] ?? key;
    result[mappedKey] = value;
  }
  return result;
}
