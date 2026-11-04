import type { ClientErrorCode } from './errors';
import { MAX_FILE_SIZE_BYTES } from './limits';

/** Every PDF starts with these bytes: "%PDF-". */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * Cheap checks on metadata, before reading any bytes. Some systems report an empty MIME
 * type, so a ".pdf" extension is enough here; the signature check catches renamed files.
 */
export function checkFileMetadata(file: {
  name: string;
  type: string;
  size: number;
}): ClientErrorCode | null {
  const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!looksLikePdf) {
    return 'file_not_pdf';
  }
  if (file.size === 0) {
    return 'file_empty';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'file_too_large';
  }
  return null;
}

/** Full validation of a picked or dropped file. Resolves to an error code or null when valid. */
export async function validatePdfFile(file: File): Promise<ClientErrorCode | null> {
  const metadataError = checkFileMetadata(file);
  if (metadataError) {
    return metadataError;
  }
  const header = new Uint8Array(await file.slice(0, PDF_SIGNATURE.length).arrayBuffer());
  return hasPdfSignature(header) ? null : 'file_not_pdf';
}
