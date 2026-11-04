import type { AnalysisResult } from '../schema';

/**
 * Valid example result (matches docs/BRIEF.md). Used by schema tests and
 * by the frontend while the real worker is not available.
 */
export const sampleResult: AnalysisResult = {
  document: {
    fileName: 'umowa.pdf',
    pages: 4,
    language: 'pl',
    type: 'umowa',
    title: 'Umowa serwisowa',
    date: '2026-09-01',
  },
  summary:
    'Umowa określa zasady świadczenia usług serwisowych przez Wykonawcę. Okres obowiązywania wynosi 12 miesięcy. Wynagrodzenie płatne jest miesięcznie na podstawie faktury.',
  keyPoints: ['Okres umowy 12 mies.', 'Wynagrodzenie 12 500 PLN', 'Termin płatności 14 dni'],
  entities: { organizations: ['Przykład sp. z o.o.'], people: [] },
  amounts: [{ value: 12500, currency: 'PLN', context: 'wynagrodzenie' }],
  dates: [{ date: '2026-10-01', context: 'termin płatności' }],
  keywords: ['serwis', 'SLA'],
};
