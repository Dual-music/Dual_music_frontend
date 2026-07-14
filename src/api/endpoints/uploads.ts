/**
 * Uploads endpoints — wrappers over `/uploads/*`.
 *
 * The backend issues presigned URLs (S3-style) for direct browser upload, then
 * confirms the object. Replaces `supabase.storage.from(...).upload(...)`.
 *
 * Flow:
 *   1. presign({ fileName, contentType, kind }) → { uploadUrl, key, ... }
 *   2. PUT the file bytes to `uploadUrl` (see {@link uploadToPresignedUrl})
 *   3. confirm({ key, ... }) → { url }
 *
 * @module api/endpoints/uploads
 */

import { http } from "../http";

/** Storage categories accepted by the backend presign endpoint. */
export type UploadCategory =
  | "avatar"
  | "image"
  | "video"
  | "lifestyle"
  | "replay"
  | "sponsor"
  | "attachment";

export interface PresignResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  [key: string]: unknown;
}

export interface PresignInput {
  category: UploadCategory;
  filename: string;
  contentType: string;
  size: number;
}

/** POST /uploads/presign — get a presigned PUT URL. */
export function presign(input: PresignInput): Promise<PresignResult> {
  return http.post<PresignResult>("/uploads/presign", input);
}

/** POST /uploads/presign-download — get a presigned GET URL for a private key. */
export function presignDownload(key: string): Promise<{ url: string; [key: string]: unknown }> {
  return http.post("/uploads/presign-download", { key });
}

/** POST /uploads/confirm — validate magic bytes + scan, returns the final URL. */
export function confirm(key: string): Promise<{ url?: string; publicUrl?: string; [key: string]: unknown }> {
  return http.post("/uploads/confirm", { key });
}

/**
 * Uploads raw bytes to a presigned URL via `PUT` (bypasses our JSON client).
 * @returns resolves when the storage provider accepts the object.
 */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: File | Blob,
  contentType?: string,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: contentType ? { "Content-Type": contentType } : undefined,
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
}

/**
 * Convenience one-shot: presign → PUT bytes → confirm → final public URL.
 * @param file the file to upload
 * @param category storage category (drives the server-side key prefix + checks)
 */
export async function uploadFile(file: File, category: UploadCategory): Promise<string> {
  const p = await presign({
    category,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  });
  await uploadToPresignedUrl(p.uploadUrl, file, file.type);
  const confirmed = await confirm(p.key);
  return confirmed.publicUrl ?? confirmed.url ?? p.publicUrl;
}
