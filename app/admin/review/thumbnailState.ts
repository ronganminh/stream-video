// Shared state shape for the thumbnail-choice action. Kept out of the
// "use server" actions module because that file may only export async
// functions (a value export like INITIAL_THUMBNAIL_STATE is rejected at build
// time: "A 'use server' file can only export async functions").

export type ThumbnailActionState = {
  ok: boolean;
  error?: string;
};

export const INITIAL_THUMBNAIL_STATE: ThumbnailActionState = { ok: true };
