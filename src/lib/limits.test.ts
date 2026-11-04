import { describe, expect, it } from 'vitest';
import { isWithinSizeLimit, MAX_FILE_SIZE_BYTES } from './limits';

// Placeholder test for the setup stage; schema tests will replace it.
describe('isWithinSizeLimit', () => {
  it('accepts a file at exactly the limit', () => {
    expect(isWithinSizeLimit(MAX_FILE_SIZE_BYTES)).toBe(true);
  });

  it('rejects empty and oversized files', () => {
    expect(isWithinSizeLimit(0)).toBe(false);
    expect(isWithinSizeLimit(MAX_FILE_SIZE_BYTES + 1)).toBe(false);
  });
});
