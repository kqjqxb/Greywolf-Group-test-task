import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '../src/lib/schema';
import { EN_CV_CHECKS, type Check } from './expectations';

/** A result that the fictional English CV should produce with prompt 1.2.0. */
const goodCvResult: AnalysisResult = {
  document: {
    fileName: 'Jordan_Ellis_CV.pdf',
    pages: 2,
    language: 'en',
    type: 'inne',
    title: null,
    date: null,
  },
  summary:
    'This is the CV of Jordan Ellis, a senior mobile engineer from Leeds. Since March 2024 Jordan has worked at Brightfield Labs Ltd. Before that Jordan was a freelance mobile developer. Jordan studied computer science at the University of Westmere.',
  keyPoints: ['Eight years of mobile experience', 'Led a team of four', 'Four apps shipped'],
  entities: {
    organizations: ['Brightfield Labs Ltd', 'University of Westmere', 'Northcove Studio'],
    people: ['Jordan Ellis'],
  },
  amounts: [],
  dates: [
    { date: '2021-06', context: 'start of freelance work' },
    { date: '2022-09-15', context: 'Google Associate Android Developer certificate' },
    { date: '2024-03-01', context: 'end of freelance work; start at Brightfield Labs Ltd' },
    { date: '2026-10', context: 'end of employment at Brightfield Labs Ltd' },
  ],
  keywords: ['mobile engineer', 'React Native', 'CV'],
};

function failedChecks(checks: readonly Check[], result: AnalysisResult): string[] {
  return checks
    .filter((check) => check.run({ result, pageTexts: [] }) === false)
    .map((check) => check.name);
}

describe('EN_CV_CHECKS', () => {
  it('pass for a correct result', () => {
    expect(failedChecks(EN_CV_CHECKS, goodCvResult)).toEqual([]);
  });

  it('catch the prompt 1.1.0 defects', () => {
    const bad: AnalysisResult = {
      ...goodCvResult,
      summary: `${goodCvResult.summary} The document does not state any compensation.`,
      entities: { ...goodCvResult.entities, organizations: ['Brightfield Labs Ltd', 'App Store'] },
      dates: [
        { date: '2024-03-01', context: 'początek pracy w Brightfield Labs' },
        { date: '2026-10-01', context: 'end of employment' },
      ],
    };
    expect(failedChecks(EN_CV_CHECKS, bad)).toEqual([
      'language: every text value is English',
      'organization University of Westmere',
      'organizations: no products/platforms',
      'dates: month-year 2026-10 kept (end of job)',
      'dates: month-year 2021-06 kept (start of freelance)',
      'dates: no invented day (2026-10-01, 2021-06-01)',
      'dates: 2024-03-01 (DD/MM) has both events',
      'summary: no missing-information filler',
    ]);
  });
});
