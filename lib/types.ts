export type Track = unknown;

export type Availability =
  | "AVAILABLE"
  | "PROCESSING"
  | "REMOVED"
  | "BLOCKED"
  | "AGE_RESTRICTED"
  | "REGION_RESTRICTED"
  | "FAILED";

export type VideoCard = {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  previewUrl?: string;
  durationSeconds: number | null;
  views: number;
  publishedAt: string;
  quality?: "4K" | "HD";
  hot?: boolean;
  isNew?: boolean;
  watchedProgress?: number;
  availability?: Availability;
};

export type HostId = string;

export type MirrorPublic = {
  hostId: HostId;
  label: string;
  embedUrl: string;
};

export type VideoPage = VideoCard & {
  description: string;
  stream?: { hlsUrl: string; posterUrl: string; captions?: Track[] };
  category: { slug: string; name: string };
  tags: { slug: string; name: string }[];
  likes: number;
  upNext: VideoCard[];
  related: VideoCard[];
  popularNow: VideoCard[];
  previewSprite?: string;
};

export type ListPage = {
  items: VideoCard[];
  page: number;
  pageSize: number;
  total: number;
  nextHref?: string;
  prevHref?: string;
};

export type Category = {
  slug: string;
  name: string;
  count: number;
  thumbnailUrl: string | null;
  group: string;
  trending?: boolean;
  description?: string;
};

export type Tag = {
  slug: string;
  name: string;
  count: number;
};

export type ListQuery = {
  window?: string;
  sort?: string;
  duration?: string;
  date?: string;
  category?: string;
  page?: number;
};

export type SearchResult = Omit<ListPage, "items"> & {
  results: VideoCard[];
  relatedCategories: Category[];
  relatedTags: Tag[];
};
