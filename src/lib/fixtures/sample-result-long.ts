import type { AnalysisResult } from '../schema';

/**
 * DEV-ONLY long example result, shaped like the real output for the test contract
 * "Umowa ramowa nr 14/2026" (17 amounts, 9 dates, 9 people, 2 organizations, 7 key points).
 * Returned by the dev mock for file names containing "umowa_14", to check the dashboard
 * layout with long lists. Not used in production builds.
 */
export const sampleResultLong: AnalysisResult = {
  document: {
    fileName: 'Test_PDF_Insight_umowa_14-2026.pdf',
    pages: 12,
    language: 'pl',
    type: 'umowa',
    title: 'Umowa ramowa nr 14/2026 o wdrożenie i utrzymanie systemu CRM',
    date: '2026-03-12',
  },
  summary:
    'Umowa ramowa zawarta między Nordwave Logistics sp. z o.o. (Zamawiający) a Kwadrat Software S.A. (Wykonawca) dotyczy wdrożenia i utrzymania systemu CRM w modelu SaaS dla 120 użytkowników. Wdrożenie przebiega w pięciu etapach od 1 kwietnia do 6 listopada 2026 r., a planowany termin Go-live to 12 października 2026 r. Wynagrodzenie ryczałtowe za wdrożenie wynosi 184 500,00 zł netto, a po Go-live obowiązuje abonament 12 300,00 PLN netto miesięcznie oraz opłaty licencyjne i hostingowe. Umowa zawiera gwarancję dostępności 99,5%, kary umowne z limitem 20% wynagrodzenia oraz obowiązek poufności przez 5 lat po jej zakończeniu.',
  keyPoints: [
    'Umowa obowiązuje od 1 kwietnia 2026 r. do 31 marca 2028 r. z automatycznym przedłużeniem o 12 miesięcy',
    'Wdrożenie w pięciu etapach (E1–E5), każdy płatny po podpisaniu protokołu odbioru',
    'Planowany Go-live: 12 października 2026 r., przesunięcie maks. o 10 Dni Roboczych',
    'Wynagrodzenie za wdrożenie 184 500,00 zł netto, zaliczka 30% w ciągu 14 dni od zawarcia',
    'Gwarantowana dostępność 99,5% miesięcznie; obniżka abonamentu do 30% za niedotrzymanie SLA',
    'Kary umowne łącznie nie mogą przekroczyć 20% całkowitego wynagrodzenia netto',
    'Poufność obowiązuje przez 5 lat po rozwiązaniu lub wygaśnięciu Umowy',
  ],
  entities: {
    organizations: ['Nordwave Logistics sp. z o.o.', 'Kwadrat Software S.A.'],
    people: [
      'Anna Kowalczyk',
      'Marek Zieliński',
      'Paweł Dąbrowski',
      'Tomasz Wiśniewski',
      'Julia Mazur',
      'Katarzyna Nowak',
      'Piotr Lewandowski',
      'Michał Kamiński',
      'Ewa Szymańska',
    ],
  },
  amounts: [
    {
      value: 250000,
      currency: 'PLN',
      context: 'maksymalny budżet Zamawiającego na etap wdrożenia (netto)',
    },
    {
      value: 27675,
      currency: 'PLN',
      context: 'etap E1 — analiza przedwdrożeniowa i warsztaty z działami (netto)',
    },
    {
      value: 73800,
      currency: 'PLN',
      context: 'etap E2 — konfiguracja Systemu i migracja danych (netto)',
    },
    {
      value: 46125,
      currency: 'PLN',
      context: 'etap E3 — integracje z ERP, pocztą e-mail i telefonią VoIP (netto)',
    },
    {
      value: 27675,
      currency: 'PLN',
      context: 'etap E4 — testy akceptacyjne (UAT) i szkolenia (netto)',
    },
    {
      value: 9225,
      currency: 'PLN',
      context: 'etap E5 — Go-live i wsparcie powdrożeniowe (hypercare) (netto)',
    },
    {
      value: 184500,
      currency: 'PLN',
      context: 'wynagrodzenie ryczałtowe za realizację wdrożenia (netto)',
    },
    { value: 42435, currency: 'PLN', context: 'podatek VAT 23% od wynagrodzenia za wdrożenie' },
    { value: 226935, currency: 'PLN', context: 'wynagrodzenie za wdrożenie brutto' },
    {
      value: 12300,
      currency: 'PLN',
      context: 'abonament miesięczny za utrzymanie Systemu po Go-live (netto)',
    },
    { value: 15129, currency: 'PLN', context: 'abonament miesięczny za utrzymanie (brutto)' },
    {
      value: 8600,
      currency: 'EUR',
      context: 'roczne opłaty licencyjne za 4 instancje modułu analitycznego',
    },
    {
      value: 890,
      currency: 'USD',
      context: 'miesięczny koszt infrastruktury chmurowej, refakturowany bez marży',
    },
    { value: 240, currency: 'PLN', context: 'stawka netto za roboczogodzinę prac dodatkowych' },
    {
      value: 60000,
      currency: 'PLN',
      context: 'roczny limit wartości prac dodatkowych (netto)',
    },
    {
      value: 50000,
      currency: 'PLN',
      context: 'kara umowna za każde naruszenie poufności (limit 200 000,00 zł)',
    },
    {
      value: 40,
      currency: 'EUR',
      context: 'rekompensata za opóźnienie w płatności w transakcjach handlowych',
    },
  ],
  dates: [
    { date: '2026-03-02', context: 'pełnomocnictwo dla przedstawiciela Wykonawcy' },
    { date: '2026-03-12', context: 'zawarcie Umowy w Gdańsku' },
    { date: '2026-04-01', context: 'początek obowiązywania Umowy i etapu E1' },
    { date: '2026-04-02', context: 'spotkanie otwierające (kick-off) w siedzibie Zamawiającego' },
    { date: '2026-10-12', context: 'planowany termin Go-live' },
    { date: '2026-11-06', context: 'koniec etapu E5 i okresu hypercare' },
    { date: '2026-11-20', context: 'termin przeglądu po wdrożeniu (post-mortem)' },
    { date: '2027-03-31', context: 'koniec obowiązywania cennika usług dodatkowych' },
    { date: '2028-03-31', context: 'koniec okresu obowiązywania Umowy' },
  ],
  keywords: ['CRM', 'wdrożenie', 'SaaS', 'SLA', 'utrzymanie', 'kary umowne', 'poufność', 'RODO'],
};
