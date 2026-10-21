import { beforeEach, describe, expect, it, vi } from "vitest";

const runNewVideos = vi.fn();
const runHealthCheck = vi.fn();
const runMediaResize = vi.fn();

vi.mock("../lib/sync/newVideos", () => ({ runNewVideos }));
vi.mock("../lib/sync/healthCheck", () => ({ runHealthCheck }));
vi.mock("../lib/sync/resizeMedia", () => ({ runMediaResize }));

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

  it("dispatches media:resize and passes --dry-run through", async () => {
    runMediaResize.mockResolvedValue({
      scanned: 3,
      resized: 1,
      versioned: 1,
      unchanged: 1,
      errors: [],
    });
    const { runCli } = await import("./cli");

    await expect(runCli(["media:resize", "--dry-run"])).resolves.toBe(0);
    expect(runMediaResize).toHaveBeenCalledWith({ dryRun: true });
  });

  it("fails media:resize when any thumbnail could not be repaired", async () => {
    runMediaResize.mockResolvedValue({
      scanned: 1,
      resized: 0,
      versioned: 0,
      unchanged: 0,
      errors: ["video v1: ENOENT"],
    });
    const { runCli } = await import("./cli");

    await expect(runCli(["media:resize"])).resolves.toBe(1);
    expect(runMediaResize).toHaveBeenCalledWith({ dryRun: false });
  });

  it("rejects unknown commands", async () => {
    const { runCli } = await import("./cli");
    await expect(runCli(["unknown"])).resolves.toBe(1);
  });
});
