export type HostFileDTO = {
  code: string;
  title: string;
  lengthSeconds: number | null;
  thumbnailUrl: string | null;
  uploadedAt: string | null;
};

export interface HostProvider {
  id: string;
  label: string;
  embedDomains: string[];
  listFiles(options: {
    page: number;
    perPage: number;
  }): Promise<{ files: HostFileDTO[]; hasMore: boolean }>;
  getFileInfo(code: string): Promise<HostFileDTO | null>;
  embedUrl(code: string): string;
  /**
   * A URL ffmpeg can read the video from (an MP4 or an HLS manifest), for
   * making X clips on the VPS. Only hosts whose API offers one implement it.
   * `ip` is the public IPv4 of the machine that will fetch it.
   */
  directVideoUrl?(code: string, options?: { ip?: string }): Promise<DirectVideo>;
}

export type DirectVideo = { url: string; kind: "file" | "hls" };
