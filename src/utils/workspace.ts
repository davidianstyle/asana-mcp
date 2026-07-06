// Resolves "the configured workspace" for tools that let a workspace param
// default (e.g. asana_get_users_for_workspace). This server runs one process
// per workspace (--slug selects an ASANA_PAT_<SLUG> token — see src/auth.ts),
// so the first workspace visible to that token is the right default.
import Asana from "asana";
import { ServiceContext } from "../types.js";

interface WorkspaceLike {
  gid: string;
}

/** Pure: picks the first workspace's gid, or throws when there are none. */
export function pickDefaultWorkspaceGid(workspaces: readonly WorkspaceLike[]): string {
  const first = workspaces[0];
  if (!first) {
    throw new Error(
      "No workspace is visible to this account's token — pass workspace_id explicitly."
    );
  }
  return first.gid;
}

/** Resolves the default workspace gid for the account behind `ctx.apiClient`. */
export async function resolveDefaultWorkspace(ctx: ServiceContext): Promise<string> {
  const res = await new Asana.WorkspacesApi(ctx.apiClient).getWorkspaces({ limit: 1 });
  return pickDefaultWorkspaceGid((res.data ?? []) as WorkspaceLike[]);
}
