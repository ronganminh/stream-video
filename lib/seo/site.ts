export const SITE_URL = "https://gayvideo.fun";

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}
