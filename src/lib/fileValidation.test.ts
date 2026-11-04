import { describe, expect, it } from 'vitest';
import { checkFileMetadata, hasPdfSignature, validatePdfFile } from './fileValidation';
import { MAX_FILE_SIZE_BYTES } from './limits';

const encoder = new TextEncoder();

describe('hasPdfSignature', () => {
  it('accepts bytes starting with %PDF-', () => {
    expect(hasPdfSignature(encoder.encode('%PDF-1.7\n'))).toBe(true);
  });

  it('rejects other content and too short input', () => {
    expect(hasPdfSignature(encoder.encode('<html>'))).toBe(false);
    expect(hasPdfSignature(encoder.encode('%PDF'))).toBe(false);
    expect(hasPdfSignature(new Uint8Array())).toBe(false);
  });
});

describe('checkFileMetadata', () => {
  const pdf = { name: 'umowa.pdf', type: 'application/pdf', size: 1000 };

  it('accepts a PDF by MIME type or by extension (empty MIME on some systems)', () => {
    expect(checkFileMetadata(pdf)).toBeNull();
    expect(checkFileMetadata({ ...pdf, name: 'UMOWA.PDF', type: '' })).toBeNull();
  });

  it('rejects non-PDF files', () => {
    expect(checkFileMetadata({ name: 'notes.txt', type: 'text/plain', size: 10 })).toBe(
      'file_not_pdf',
    );
  });

  it('rejects empty files and files over the limit', () => {
    expect(checkFileMetadata({ ...pdf, size: 0 })).toBe('file_empty');
    expect(checkFileMetadata({ ...pdf, size: MAX_FILE_SIZE_BYTES })).toBeNull();
    expect(checkFileMetadata({ ...pdf, size: MAX_FILE_SIZE_BYTES + 1 })).toBe('file_too_large');
  });
});

describe('validatePdfFile', () => {
  it('accepts a real PDF header', async () => {
    const file = new File(['%PDF-1.4 rest'], 'a.pdf', { type: 'application/pdf' });
    expect(await validatePdfFile(file)).toBeNull();
  });

  it('rejects a renamed non-PDF file by its magic bytes', async () => {
    const file = new File(['PK\u0003\u0004 zip'], 'fake.pdf', { type: 'application/pdf' });
    expect(await validatePdfFile(file)).toBe('file_not_pdf');
  });
});
