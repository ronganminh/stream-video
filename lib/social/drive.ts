// Google Drive files shared as "anyone with the link": the fallback source
// for X clips when no host gives a direct file URL.

const FILE_PATTERNS = [
  /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/,
  /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})/,
  /drive\.usercontent\.google\.com\/download\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,})/,
  /docs\.google\.com\/[^?#]*\/d\/([A-Za-z0-9_-]{10,})/,
];

export class DriveLinkError extends Error {}

/** The file id of a Drive file link; throws for folders and other URLs. */
export function driveFileId(link: string): string {
  const text = link.trim();
  if (/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//.test(text)) {
    throw new DriveLinkError("Đây là link thư mục; hãy dán link của chính file video.");
  }
  for (const pattern of FILE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[1];
  }
  throw new DriveLinkError("Không phải link file Google Drive (dạng drive.google.com/file/d/…).");
}

/** Normalised "anyone with the link" view URL, the form stored in the DB. */
export function driveViewUrl(link: string): string {
  return `https://drive.google.com/file/d/${driveFileId(link)}/view`;
}

/**
 * Direct download URL. confirm=t skips the "too large to scan for viruses"
 * page; drive.usercontent.google.com answers HTTP Range requests, so ffmpeg
 * can seek in it without downloading the whole file.
 */
export function driveDownloadUrl(link: string): string {
  return `https://drive.usercontent.google.com/download?id=${driveFileId(link)}&export=download&confirm=t`;
}

/** The first Drive *file* link in a migration CSV cell (several may be listed). */
export function firstDriveFileLink(cell: string | undefined): string | null {
  for (const url of cell?.match(/https:\/\/(?:drive|docs)\.google\.com\/[^\s;,"']+/g) ?? []) {
    try {
      return driveViewUrl(url);
    } catch {
      // a folder or something else: try the next one
    }
  }
  return null;
}
