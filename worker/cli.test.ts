import { beforeEach, describe, expect, it, vi } from "vitest";

const runNewVideos = vi.fn();
const runHealthCheck = vi.fn();

vi.mock("../lib/sync/newVideos", () => ({ runNewVideos }));
vi.mock("../lib/sync/healthCheck", () => ({ runHealthCheck }));

describe("sync CLI", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("dispatches sync:new through the shared job function", async () => {
    runNewVideos.mockResolvedValue({
      skipped: false,
      run: { created: 2, matched: 1 },
    });
    const { runCli } = await import("./cli");

    await expect(runCli(["sync:new"])).resolves.toBe(0);
    expect(runNewVideos).toHaveBeenCalledTimes(1);
  });

  it("dispatches sync:health through the shared job function", async () => {
    runHealthCheck.mockResolvedValue({
      skipped: false,
      run: { missing: 3 },
    });
    const { runCli } = await import("./cli");

    await expect(runCli(["sync:health"])).resolves.toBe(0);
    expect(runHealthCheck).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown commands", async () => {
    const { runCli } = await import("./cli");
    await expect(runCli(["unknown"])).resolves.toBe(1);
  });
});
