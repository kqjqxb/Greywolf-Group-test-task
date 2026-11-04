import { describe, expect, it } from 'vitest';
import { parseTextFixture } from './fixture';

describe('parseTextFixture', () => {
  it('reads the header, splits pages and adds the app page markers', () => {
    const fixture = parseTextFixture(
      [
        '# A comment',
        '# fileName: cv.pdf',
        '# pages: 2',
        '# expectations: en-cv',
        'Page one',
        '=== PAGE BREAK ===',
        'Page two',
      ].join('\n'),
    );
    expect(fixture.fileName).toBe('cv.pdf');
    expect(fixture.pages).toBe(2);
    expect(fixture.suite).toBe('en-cv');
    expect(fixture.pageTexts).toEqual(['Page one', 'Page two']);
    expect(fixture.text).toBe('--- Strona 1 ---\nPage one\n\n--- Strona 2 ---\nPage two');
  });

  it('rejects a header whose page count does not match the body', () => {
    expect(() => parseTextFixture('# fileName: a.pdf\n# pages: 3\nOnly one page')).toThrow(
      /3 pages/,
    );
  });

  it('rejects a fixture without a file name', () => {
    expect(() => parseTextFixture('# pages: 1\ntext')).toThrow(/fileName/);
  });
});
