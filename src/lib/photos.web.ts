// Web preview: browsers can't keep picked files across reloads, so queued
// photos live in memory only (fine for the preview; phones persist them).
import type { PhotoInput } from './types';

const blobs = new Map<string, Blob>();

export async function persistPhoto(photo: PhotoInput): Promise<PhotoInput> {
  if (photo.file) blobs.set(photo.uri, photo.file);
  return { uri: photo.uri, name: photo.name, type: photo.type };
}

export function photoForUpload(photo: PhotoInput): PhotoInput {
  return { ...photo, file: blobs.get(photo.uri) };
}

export function deletePhoto(uri: string): void {
  blobs.delete(uri);
}
