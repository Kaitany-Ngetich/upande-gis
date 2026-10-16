// Inspection photos waiting to be sent. The camera writes to a cache folder
// the OS may clear, so each photo is copied into the app's documents
// directory until ERP has it.
import { Directory, File, Paths } from 'expo-file-system';

import type { PhotoInput } from './types';

const dir = () => new Directory(Paths.document, 'inspection-photos');

export async function persistPhoto(photo: PhotoInput): Promise<PhotoInput> {
  const d = dir();
  d.create({ idempotent: true, intermediates: true });
  const safe = photo.name.replace(/[^\w.-]+/g, '_');
  const dest = new File(d, `${Date.now()}-${safe}`);
  await new File(photo.uri).copy(dest);
  return { uri: dest.uri, name: photo.name, type: photo.type };
}

/** The bytes for upload - on phones the uri is enough. */
export function photoForUpload(photo: PhotoInput): PhotoInput {
  return photo;
}

export function deletePhoto(uri: string): void {
  try {
    if (uri.includes('inspection-photos')) new File(uri).delete();
  } catch {
    // already gone
  }
}
