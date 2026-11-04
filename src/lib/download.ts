const FALLBACK_BASE_NAME = 'dokument';
const MAX_BASE_NAME_LENGTH = 100;

/**
 * File name for the exported JSON, derived from the PDF name:
 * "umowa.pdf" → "umowa.analysis.json". Characters not allowed in file names are replaced.
 */
export function deriveJsonFileName(pdfFileName: string): string {
  const baseName = pdfFileName
    .replace(/\.pdf$/i, '')
    // eslint-disable-next-line no-control-regex -- control characters are exactly what we strip
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, MAX_BASE_NAME_LENGTH);
  return `${baseName || FALLBACK_BASE_NAME}.analysis.json`;
}

/** Pretty-printed JSON used for both the preview and the download, so they always match. */
export function toPrettyJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Starts a browser download of `json` as a .json file. */
export function downloadJson(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
