import type { ClipboardItem } from '../../db';

/** All clipboard item types in display order. */
export const CLIPBOARD_TYPES = [
  'Note',
  'Boarding Pass',
  'Hotel',
  'Email',
  'Location',
  'Other',
] as const;

export type ClipboardType = ClipboardItem['type'];

/**
 * Colour-coded left border per clipboard type (Tailwind border-* class).
 * Uses the app's cyan/sky accent palette plus supporting hues.
 */
export const TYPE_BORDER: Record<ClipboardType, string> = {
  Note: 'border-category-slate',
  'Boarding Pass': 'border-category-cyan',
  Hotel: 'border-category-sky',
  Email: 'border-category-violet',
  Location: 'border-category-emerald',
  Other: 'border-category-amber',
};

/** Body character limits. */
export const BODY_MAX = 50_000;
export const BODY_WARN = 45_000;

/** File upload limits (bytes) and accepted MIME types. */
export const FILE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

export const ACCEPTED_MIME = Object.keys(ACCEPTED_FILE_TYPES);

/** Human-readable file size, e.g. 1.4 MB / 812 KB. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** True if a MIME type is an accepted image (for thumbnail preview). */
export function isImageMime(mime: string | undefined): boolean {
  return !!mime && mime.startsWith('image/') && ACCEPTED_MIME.includes(mime);
}
