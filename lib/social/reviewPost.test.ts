import { describe, expect, it } from "vitest";

import { planXPost, readXReviewInput, xStatusLabel } from "./reviewPost";

const config = { clipSeconds: 120, maxVideoSeconds: 140 };
const input = (overrides: Partial<{ mode: string; start: number; caption: string }> = {}) => ({
  mode: "clip" as const,
  start: 0,
  caption: "Worth the wait 🔥",
  ...overrides,
}) as Parameters<typeof planXPost>[0];

describe("planXPost", () => {
  it("cuts a 120 s clip from the start time by default", () => {
    const { plan, errors } = planXPost(input({ start: 30 }), { durationSeconds: 600 }, null, config);
    expect(errors).toEqual([]);
    expect(plan).toEqual({ action: "prepare", mode: "clip", caption: "Worth the wait 🔥", start: 30, seconds: 120 });
  });

  it("keeps a short video whole, and cuts a long one to X_MAX_VIDEO_SECONDS with a warning", () => {
    const short = planXPost(input({ mode: "full" }), { durationSeconds: 95 }, null, config);
    expect(short.plan).toMatchObject({ action: "prepare", mode: "full", start: 0, seconds: 95 });
    expect(short.warnings).toEqual([]);

    const long = planXPost(input({ mode: "full" }), { durationSeconds: 600 }, null, config);
    expect(long.plan).toMatchObject({ mode: "full", seconds: 140 });
    expect(long.warnings[0]).toContain("quá giới hạn X 2:20");
    expect(long.warnings[0]).toContain("tự cắt");
  });

  it("clips never run past the end, and a start past the end starts at 0", () => {
    expect(planXPost(input({ start: 550 }), { durationSeconds: 600 }, null, config).plan).toMatchObject({ seconds: 50 });
    const late = planXPost(input({ start: 700 }), { durationSeconds: 600 }, null, config);
    expect(late.plan).toMatchObject({ start: 0, seconds: 120 });
    expect(late.warnings.length).toBe(1);
  });

  it("refuses banned words and links in the caption", () => {
    const banned = planXPost(input({ caption: "Hot nude guys" }), { durationSeconds: 600 }, null, config);
    expect(banned.plan).toEqual({ action: "none" });
    expect(banned.errors[0]).toContain("nude");
    const extra = planXPost(input({ caption: "Shower time" }), { durationSeconds: 600 }, null, config, ["shower"]);
    expect(extra.errors.length).toBe(1);
  });

  it("'Không đăng X' needs no caption", () => {
    expect(planXPost(input({ mode: "none", caption: "" }), { durationSeconds: 60 }, null, config)).toEqual({
      plan: { action: "none" },
      warnings: [],
      errors: [],
    });
  });

  it("'Dùng clip đã có' needs an existing clip", () => {
    const withClip = { status: "waiting" as const, clipFile: "clip-a.mp4" };
    expect(planXPost(input({ mode: "keep" }), { durationSeconds: 60 }, withClip, config).plan).toEqual({
      action: "keep",
      caption: "Worth the wait 🔥",
    });
    expect(planXPost(input({ mode: "keep" }), { durationSeconds: 60 }, null, config).errors.length).toBe(1);
  });

  it("never touches a post Buffer already has", () => {
    const sent = planXPost(input(), { durationSeconds: 60 }, { status: "sent", clipFile: null }, config);
    expect(sent.plan).toEqual({ action: "none" });
    expect(sent.warnings[0]).toContain("không đổi");
  });
});

describe("readXReviewInput", () => {
  it("reads the form, defaulting to a clip", () => {
    const form = new Map<string, string>([["xMode", "full"], ["xStart", "12,5"], ["xCaption", "Hi"]]);
    expect(readXReviewInput(form)).toEqual({ mode: "full", start: 12, caption: "Hi" });
    expect(readXReviewInput(new Map([["xMode", "weird"], ["xStart", "-3"]]))).toEqual({ mode: "clip", start: 0, caption: "" });
  });
});

describe("xStatusLabel", () => {
  it("maps every status to processing / queued / posted / error", () => {
    expect(xStatusLabel("preparing")).toEqual({ label: "Đang xử lý clip", tone: "busy" });
    expect(xStatusLabel("queued").tone).toBe("queued");
    expect(xStatusLabel("pushed").label).toBe("Trong hàng đợi Buffer");
    expect(xStatusLabel("sent")).toEqual({ label: "Đã đăng", tone: "done" });
    expect(xStatusLabel("failed")).toEqual({ label: "Lỗi", tone: "error" });
  });
});
