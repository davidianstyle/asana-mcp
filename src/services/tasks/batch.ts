// Helpers for the Asana Batch API (`POST /batch`, SDK: `BatchAPIApi.createBatchRequest`).
//
// The SDK's generated `BatchAPIApi.d.ts` types the request/response as `body: any` —
// swagger-codegen doesn't model this endpoint's shape — so the action/response
// contract below is taken from Asana's public OpenAPI schema instead
// (raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml):
//   - Request: `{ data: { actions: [...] } }`, max 10 actions per request.
//   - Each action: `{ relative_path, method, data?, options? }` — `data` is the
//     content you'd otherwise put in the sub-request's own `data` body field (for
//     POST/PUT) or its query params (for GET); `options.fields` is the batch-native
//     way to pass `opt_fields`.
//   - Each response item: `{ status_code, headers, body }`, in the same order as
//     the submitted actions — `body` is exactly what the invoked endpoint would
//     have returned directly, i.e. still wrapped in Asana's own `{ data: {...} }`
//     envelope for a single-resource endpoint.

/** Asana's documented cap on actions per `/batch` request. */
export const MAX_BATCH_ACTIONS = 10;

/** Splits an array into consecutive chunks of at most `size` items each. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export type BatchMethod = "get" | "post" | "put" | "delete";

export interface BatchAction {
  relative_path: string;
  method: BatchMethod;
  data?: Record<string, unknown>;
  options?: { fields?: string[] };
}

export interface BatchActionResult {
  status_code: number;
  headers?: Record<string, string>;
  body?: unknown;
}

/** True for any 2xx status code. */
export function isBatchActionSuccess(result: BatchActionResult): boolean {
  return result.status_code >= 200 && result.status_code < 300;
}

/** Extracts a joined, human-readable message from a failed action's Asana-shaped error body. */
export function batchActionErrorMessage(body: unknown): string {
  const errors = (body as { errors?: Array<{ message?: string }> } | null | undefined)
    ?.errors;
  const messages = errors?.map((e) => e.message).filter((m): m is string => Boolean(m));
  return messages && messages.length > 0 ? messages.join("; ") : "Unknown error";
}

/** Builds a `GET /tasks/{gid}` batch action requesting the given opt_fields. */
export function buildGetTaskAction(taskId: string, fields: string[]): BatchAction {
  return { relative_path: `/tasks/${taskId}`, method: "get", options: { fields } };
}

/** One planned batch action derived from a bulk task-update entry. */
export interface TaskUpdatePlan {
  task_id: string;
  kind: "update" | "move_section";
  action: BatchAction;
}

export interface TaskBatchUpdateInput {
  task_id: string;
  section_id?: string;
  insert_before?: string;
  insert_after?: string;
  [field: string]: unknown;
}

/**
 * Turns one `{task_id, ...fields}` bulk-update entry into zero, one, or two
 * batch actions:
 *  - a `PUT /tasks/{gid}` action for any plain field updates (name, notes,
 *    completed, assignee, dates, ...), if at least one is present; and/or
 *  - a `POST /sections/{gid}/addTask` action if `section_id` is present —
 *    Asana has no "move to section" field on the task PUT body itself,
 *    section membership is its own endpoint (mirrors `asana_add_task_to_section`).
 * An entry with neither produces no actions.
 *
 * Asana documents `/batch` actions as executing in parallel with no ordering
 * guarantee between them ("There is no guarantee of the execution order for
 * these actions" — developers.asana.com/docs/batch-requests). That's safe
 * here: the PUT touches task fields (name, dates, completed, assignee, ...)
 * and the POST touches project/section membership — disjoint aspects of the
 * task with no read-modify-write overlap between the two actions.
 */
export function buildTaskUpdateActions(update: TaskBatchUpdateInput): TaskUpdatePlan[] {
  const { task_id, section_id, insert_before, insert_after, ...rest } = update;
  const fields = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined)
  );
  const plans: TaskUpdatePlan[] = [];

  if (Object.keys(fields).length > 0) {
    plans.push({
      task_id,
      kind: "update",
      action: { relative_path: `/tasks/${task_id}`, method: "put", data: fields },
    });
  }

  if (section_id) {
    plans.push({
      task_id,
      kind: "move_section",
      action: {
        relative_path: `/sections/${section_id}/addTask`,
        method: "post",
        data: { task: task_id, insert_before, insert_after },
      },
    });
  }

  return plans;
}

/** A group of planned actions for one input update entry, keyed by its task_id. */
export interface TaskUpdatePlanGroup {
  task_id: string;
  plans: TaskUpdatePlan[];
}

export interface BatchActionReport {
  kind: "update" | "move_section";
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface TaskBatchUpdateReport {
  task_id: string;
  actions: BatchActionReport[];
}

/**
 * Zips flattened `/batch` results (in submission order) back up against the
 * plan groups they came from, producing one report entry per input update —
 * in the same order and count as the original `updates` array, even for a
 * group with zero actions.
 */
export function assembleBatchUpdateResults(
  groups: readonly TaskUpdatePlanGroup[],
  results: readonly BatchActionResult[]
): TaskBatchUpdateReport[] {
  let cursor = 0;
  return groups.map(({ task_id, plans }) => ({
    task_id,
    actions: plans.map((plan) => {
      const result = results[cursor++];
      const ok = isBatchActionSuccess(result);
      return {
        kind: plan.kind,
        success: ok,
        ...(ok
          ? { data: (result.body as { data?: unknown } | undefined)?.data }
          : { error: batchActionErrorMessage(result.body) }),
      };
    }),
  }));
}
