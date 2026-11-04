/** Maximum accepted PDF size (F-01): 10 MB. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function isWithinSizeLimit(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE_BYTES;
}
