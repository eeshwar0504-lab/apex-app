import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hands a text file to the person. In a browser it is a normal download. In the Android WebView a blob download does nothing, so the file
 * is written to the app cache and offered through the system share sheet, from where it can be saved to Drive, Files or sent anywhere.
 * The cached copy is removed again once the sheet has closed. The caller decides what the text is (an already encrypted backup).
 */
export async function exportTextFile(text: string, filename: string, type = 'application/json'): Promise<ExportOutcome> {
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return 'downloaded';
  }
  const written = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: filename, dialogTitle: 'Save your APEX backup', url: written.uri });
    return 'shared';
  } catch (error) {
    // dismissing the sheet is a choice, not a failure
    if (/cancel/i.test(error instanceof Error ? error.message : String(error))) return 'cancelled';
    throw error;
  } finally {
    try { await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }); } catch { /* the cache is cleared by the system anyway */ }
  }
}
