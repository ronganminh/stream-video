import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { rm, statfs } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

// Makes X clips on the VPS (a small Lightsail instance shared with the web):
// - ffmpeg reads the source URL directly and seeks with HTTP Range (-ss
//   before -i), so only the part being cut is downloaded; the whole file is
//   downloaded only when the source does not answer Range requests;
// - it runs at the lowest priority (nice 19, idle I/O class) with few
//   threads and a fast x264 preset, so the site stays responsive;
// - callers check free disk first and make one clip at a time.

// The worker runs from /app (Dockerfile.worker copies lib/ there).
export const WATERMARK_PNG =
  process.env.X_WATERMARK_PNG?.trim() || path.join(process.cwd(), "lib", "social", "assets", "x-watermark.png");
// The mark is drawn for a 1280 px wide frame (logo + "GayVideo.fun", 82%
// opacity, top right), as in the migration pipeline and the Colab notebook.
const WATERMARK_SCALE = 133 / 1280;
const LABEL_FONTS = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
];

export type CutInput = {
  /** URL (http/https) or local path. */
  input: string;
  start: number;
  seconds: number;
  output: string;
  /** Overlay the GayVideo.fun mark (for sources without one, e.g. Drive originals). */
  watermark: boolean;
  /** Text at the bottom of the clip, e.g. "gayvideo.fun"; empty = none. */
  label: string;
  threads: number;
  preset: string;
};

/** Escapes a filter option value for both ffmpeg parsing levels. */
export function filterValue(value: string): string {
  let out = value;
  for (const special of ["\\':", "\\'[],;"]) {
    out = [...out].map((char) => (special.includes(char) ? `\\${char}` : char)).join("");
  }
  return out;
}

function labelFilter(label: string): string | null {
  const font = LABEL_FONTS.find((file) => existsSync(file));
  if (!font) return null;
  return (
    `drawtext=fontfile=${filterValue(font)}:expansion=none:text=${filterValue(label.trim())}:fontcolor=white:` +
    "fontsize='max(16,min(w,h)/18)':box=1:boxcolor=black@0.45:boxborderw=10:" +
    "x='(w-text_w)/2':y='h-text_h-min(w,h)/14'"
  );
}

/**
 * ffmpeg arguments: same output as the notebook's clip (H.264 High yuv420p,
 * AAC-LC stereo 44.1 kHz, longest side <= 1280, <= 60 fps, +faststart).
 */
export function cutArgs(job: CutInput, watermarkPng = WATERMARK_PNG): string[] {
  const remote = /^https?:\/\//i.test(job.input);
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];
  if (remote) {
    // Give up on a stalled connection instead of hanging the worker.
    args.push("-rw_timeout", "30000000", "-reconnect", "1", "-reconnect_on_network_error", "1", "-reconnect_delay_max", "10");
  }
  if (job.start > 0) args.push("-ss", String(job.start));
  args.push("-i", job.input);
  const watermark = job.watermark && existsSync(watermarkPng);
  if (watermark) args.push("-i", watermarkPng);
  args.push("-t", String(job.seconds));

  const filters = ["[0:v]scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))'[v0]"];
  let last = "v0";
  if (watermark) {
    filters.push(
      `[1:v][v0]scale2ref=w='main_w*${WATERMARK_SCALE.toFixed(4)}':h='ow/mdar'[wm][base]`,
      "[base][wm]overlay=x='main_w-overlay_w-main_w*0.0125':y='main_w*0.0125'[v1]",
    );
    last = "v1";
  }
  const label = job.label.trim() ? labelFilter(job.label) : null;
  if (label) {
    filters.push(`[${last}]${label}[v2]`);
    last = "v2";
  }
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", `[${last}]`, "-map", "0:a:0?",
    "-fpsmax", "60",
    "-c:v", "libx264", "-preset", job.preset, "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p",
    "-crf", "23", "-maxrate", "6M", "-bufsize", "12M",
    "-threads", String(job.threads), "-filter_threads", "1", "-filter_complex_threads", "1",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
    "-movflags", "+faststart",
    "-f", "mp4",
    job.output,
  );
  return args;
}

let niceCommand: string[] | undefined;

/** ["nice", "-n", "19", "ionice", "-c3"] where available, else []. */
export function lowPriorityPrefix(): string[] {
  if (niceCommand) return niceCommand;
  const has = (command: string) => spawnSync(command, ["--version"], { stdio: "ignore" }).error === undefined;
  niceCommand = [
    ...(has("nice") ? ["nice", "-n", "19"] : []),
    ...(has("ionice") ? ["ionice", "-c3"] : []),
  ];
  return niceCommand;
}

export class CutError extends Error {}

/** Runs ffmpeg at low priority; rejects with the end of its stderr. */
export function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  const prefix = lowPriorityPrefix();
  const [command, ...rest] = [...prefix, "ffmpeg", ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, rest, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new CutError(`ffmpeg quá ${Math.round(timeoutMs / 60000)} phút, đã dừng`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CutError(`không chạy được ffmpeg: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new CutError(`ffmpeg lỗi (${code}): ${hideSecrets(stderr.trim().split("\n").slice(-3).join(" "))}`));
    });
  });
}

/** Strips query strings (signed URLs, keys) from messages. */
export function hideSecrets(text: string): string {
  return text.replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/g, "$1?…").slice(0, 400);
}

export type RangeProbe = {
  ok: boolean;
  /** The server answers Range requests (206), so ffmpeg can seek. */
  range: boolean;
  /** Total size, when known. */
  size: number | null;
  reason?: string;
};

/**
 * Asks for the first byte. A 206 with Content-Range means ffmpeg can seek;
 * an HTML answer means the link is not a public file (e.g. Drive asking to
 * sign in or over its download quota).
 */
export async function probeRange(url: string, fetchImpl: typeof fetch = fetch): Promise<RangeProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(url, {
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: controller.signal,
    });
    void response.body?.cancel().catch(() => undefined);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok) return { ok: false, range: false, size: null, reason: `HTTP ${response.status}` };
    if (type.startsWith("text/html")) {
      return { ok: false, range: false, size: null, reason: "trả về trang HTML (chưa chia sẻ công khai, hoặc vượt hạn mức tải)" };
    }
    const contentRange = response.headers.get("content-range") ?? "";
    const total = /\/(\d+)$/.exec(contentRange)?.[1];
    if (response.status === 206 && total) return { ok: true, range: true, size: Number(total) };
    const length = Number(response.headers.get("content-length"));
    return { ok: true, range: false, size: Number.isFinite(length) && length > 0 ? length : null };
  } catch (error) {
    return { ok: false, range: false, size: null, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export async function freeBytes(directory: string): Promise<number> {
  const stats = await statfs(directory);
  return Number(stats.bavail) * Number(stats.bsize);
}

/** Downloads a whole file, stopping at maxBytes (for sources without Range). */
export async function downloadWhole(
  url: string,
  target: string,
  maxBytes: number,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const response = await fetchImpl(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new CutError(`tải file: HTTP ${response.status}`);
  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new CutError(`file lớn hơn dung lượng đĩa cho phép (${Math.round(maxBytes / 1048576)} MB)`));
        return;
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body as never), counter, createWriteStream(target));
    return bytes;
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}
