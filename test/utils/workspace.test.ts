import { describe, it, expect } from "vitest";
import { pickDefaultWorkspaceGid } from "../../src/utils/workspace.js";

describe("pickDefaultWorkspaceGid", () => {
  it("returns the first workspace's gid", () => {
    expect(pickDefaultWorkspaceGid([{ gid: "111" }, { gid: "222" }])).toBe("111");
  });

  it("throws a friendly error when there are no workspaces", () => {
    expect(() => pickDefaultWorkspaceGid([])).toThrow(/workspace/i);
  });
});
