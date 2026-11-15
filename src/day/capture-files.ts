// OWNER: B (task B7). Deletes the captured meetup photo from the cache straight after OCR.
// Uses expo-file-system's native module, which ships inside `expo` (autolinked as a dependency of
// expo, already in every dev build) — no new native dependency. It isn't a top-level package, so
// we reach the native class the same way expo-file-system's own JS does.
// Native: tests never import this file (they use a fake FileDeleter).
import { requireOptionalNativeModule } from 'expo';
import type { FileDeleter } from './meetup-capture';

type NativeFile = { exists: boolean; delete(): void };
type FileSystemModule = { FileSystemFile: new (uri: string) => NativeFile };

const fileSystem = requireOptionalNativeModule<FileSystemModule>('FileSystem');

/** Only local files are ours to delete (web capture returns a data: URI with nothing on disk). */
export const deleteCapturedPhoto: FileDeleter = (uri) => {
  if (!uri.startsWith('file://')) return;
  if (!fileSystem) throw new Error('File system module unavailable');
  const file = new fileSystem.FileSystemFile(uri);
  if (file.exists) file.delete();
};
