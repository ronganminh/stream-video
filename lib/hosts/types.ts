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
}
