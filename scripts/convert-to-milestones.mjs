#!/usr/bin/env node
// One-shot migration: convert every task in a project to resource_subtype=milestone.
//
// Usage:
//   ASANA_PAT_WORK=xxxxx node scripts/convert-to-milestones.mjs <project_gid>
//
// Idempotent — re-running on a project where everything is already a milestone is a no-op
// (skipped rows reported in the summary).

import Asana from "asana";

const projectGid = process.argv[2];
if (!projectGid) {
  console.error("usage: node scripts/convert-to-milestones.mjs <project_gid>");
  process.exit(1);
}

const token = process.env.ASANA_PAT_WORK || process.env.ASANA_PAT_PERSONAL || process.env.ASANA_PAT;
if (!token) {
  console.error("set ASANA_PAT_WORK (or ASANA_PAT_PERSONAL / ASANA_PAT) in env");
  process.exit(1);
}

const client = Asana.ApiClient.instance;
client.authentications.token.accessToken = token;

const tasksApi = new Asana.TasksApi(client);

const list = await tasksApi.getTasksForProject(projectGid, {
  opt_fields: ["name", "resource_subtype"],
});

const rows = list.data || [];
console.log(`Project ${projectGid}: ${rows.length} rows`);

let converted = 0;
let skipped = 0;
let failed = 0;

for (const t of rows) {
  if (t.resource_subtype === "milestone") {
    skipped += 1;
    continue;
  }
  try {
    await tasksApi.updateTask({ data: { resource_subtype: "milestone" } }, t.gid);
    console.log(`  ✓ ${t.gid}  ${t.name}`);
    converted += 1;
  } catch (e) {
    console.error(`  ✗ ${t.gid}  ${t.name} — ${e?.response?.body?.errors?.[0]?.message || e.message}`);
    failed += 1;
  }
  // 150ms gap — keeps us well under Asana's 1500-req/min ceiling on a single PAT
  await new Promise((r) => setTimeout(r, 150));
}

console.log(`\n${converted} converted · ${skipped} already milestones · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
