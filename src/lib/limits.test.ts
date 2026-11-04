import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_CHARS, MAX_REQUEST_BODY_BYTES } from './limits';

describe('limits', () => {
  it('fits a document at the character limit into the body limit, even in a CJK script', () => {
    // 3 bytes per character in UTF-8 is the worst case for ordinary text (CJK); 1 KB for metadata.
    expect(MAX_DOCUMENT_CHARS * 3 + 1024).toBeLessThanOrEqual(MAX_REQUEST_BODY_BYTES);
  });
});
