import { readFileSync } from "node:fs";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRemovalRequest } = vi.hoisted(() => ({
  createRemovalRequest: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    removalRequest: {
      create: createRemovalRequest,
    },
  },
}));

import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function formRequest(entries: Array<[string, string]>) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) body.append(key, value);

  return new NextRequest("http://localhost/api/requests", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("POST /api/requests", () => {
  beforeEach(() => {
    createRemovalRequest.mockReset();
  });

  it("rejects an invalid payload before persistence", async () => {
    const response = await POST(
      jsonRequest({
        type: "DMCA",
        fullName: "Example Owner",
        email: "not-an-email",
        role: "OWNER",
        work: "",
        urls: ["javascript:alert(1)"],
        declarations: {
          goodFaith: true,
          authority: false,
        },
        signature: "",
        date: "04 Oct 2026",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Check the form fields and try again.",
    });
    expect(createRemovalRequest).not.toHaveBeenCalled();
  });

  it("persists a valid DMCA JSON submission", async () => {
    createRemovalRequest.mockResolvedValue({ id: "cm12345678" });

    const response = await POST(
      jsonRequest({
        type: "DMCA",
        fullName: "Example Owner",
        email: "owner@example.com",
        role: "OWNER",
        work: "Original work description",
        urls: ["https://gayvideo.fun/watch/example"],
        declarations: {
          goodFaith: true,
          authority: true,
        },
        signature: "Example Owner",
        date: "04 Oct 2026",
        website: "",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      reference: "DMCA-12345678",
    });
    expect(createRemovalRequest).toHaveBeenCalledTimes(1);
    expect(createRemovalRequest).toHaveBeenCalledWith({
      data: {
        type: "DMCA",
        payload: {
          fullName: "Example Owner",
          email: "owner@example.com",
          role: "OWNER",
          work: "Original work description",
          urls: ["https://gayvideo.fun/watch/example"],
          declarations: {
            goodFaith: true,
            authority: true,
          },
          signature: "Example Owner",
          date: "04 Oct 2026",
        },
        status: "OPEN",
      },
      select: { id: true },
    });
  });

  it("persists a valid removal form POST", async () => {
    createRemovalRequest.mockResolvedValue({ id: "crabcdefgh" });

    const response = await POST(
      formRequest([
        ["type", "REMOVAL"],
        ["reason", "PRIVACY"],
        ["urls", "https://gayvideo.fun/watch/example"],
        ["urls", "https://gayvideo.fun/watch/example-two"],
        ["email", "requester@example.com"],
        ["details", "Please review these URLs."],
        ["confirmed", "true"],
        ["website", ""],
      ]),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      reference: "CR-ABCDEFGH",
    });
    expect(createRemovalRequest).toHaveBeenCalledTimes(1);
    expect(createRemovalRequest).toHaveBeenCalledWith({
      data: {
        type: "REMOVAL",
        payload: {
          reason: "PRIVACY",
          urls: [
            "https://gayvideo.fun/watch/example",
            "https://gayvideo.fun/watch/example-two",
          ],
          email: "requester@example.com",
          details: "Please review these URLs.",
          confirmed: true,
        },
        status: "OPEN",
      },
      select: { id: true },
    });
  });

  it("keeps report contact data out of GET URLs in both public forms", () => {
    const dmca = readFileSync(
      new URL("../../(public)/content-removal/dmca/DMCAForm.tsx", import.meta.url),
      "utf8",
    );
    const removal = readFileSync(
      new URL(
        "../../(public)/content-removal/request/RemovalRequestForm.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    for (const source of [dmca, removal]) {
      expect(source).toContain('method="post"');
      expect(source).toContain('action="/api/requests"');
      expect(source).toContain('method: "POST"');
      expect(source).not.toContain('method="get"');
      expect(source).not.toMatch(/\/api\/requests\?[^"'\n]*(email|details|fullName)/i);
    }
  });
});
