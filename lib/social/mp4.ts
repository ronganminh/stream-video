import { open } from "node:fs/promises";

// Just enough MP4 parsing to accept an uploaded clip: it must be an ISO
// BMFF file (ftyp), and its duration comes from moov/mvhd. The client
// encodes with +faststart so moov is near the start, but the whole file is
// walked if needed (top-level boxes only, reading headers, not payloads).

export type Mp4Info = { durationSeconds: number; brand: string };

async function readAt(handle: Awaited<ReturnType<typeof open>>, position: number, length: number) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

/** Walks boxes in [start, end); returns [type, payloadStart, payloadEnd][]. */
async function boxes(handle: Awaited<ReturnType<typeof open>>, start: number, end: number) {
  const found: [string, number, number][] = [];
  let position = start;
  while (position + 8 <= end) {
    const header = await readAt(handle, position, 16);
    if (header.length < 8) break;
    let size = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);
    let headerSize = 8;
    if (size === 1) {
      if (header.length < 16) break;
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - position;
    }
    if (size < headerSize || position + size > end) break;
    found.push([type, position + headerSize, position + size]);
    position += size;
  }
  return found;
}

export async function readMp4Info(path: string): Promise<Mp4Info | null> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const top = await boxes(handle, 0, size);
    const ftyp = top.find(([type]) => type === "ftyp");
    if (!ftyp || top[0][0] !== "ftyp") return null;
    const brand = (await readAt(handle, ftyp[1], 4)).toString("latin1");

    const moov = top.find(([type]) => type === "moov");
    if (!moov) return null;
    const mvhd = (await boxes(handle, moov[1], moov[2])).find(([type]) => type === "mvhd");
    if (!mvhd) return null;
    const body = await readAt(handle, mvhd[1], 32);
    const version = body[0];
    const timescale = version === 1 ? body.readUInt32BE(20) : body.readUInt32BE(12);
    const duration = version === 1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
    if (!timescale) return null;
    return { durationSeconds: duration / timescale, brand };
  } finally {
    await handle.close();
  }
}
