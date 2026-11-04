import { describe, expect, it } from 'vitest';
import { countSentences } from './sentences';

describe('countSentences', () => {
  it('returns 0 for empty text', () => {
    expect(countSentences('')).toBe(0);
    expect(countSentences('   \n ')).toBe(0);
  });

  it('counts simple sentences ending with . ! ? …', () => {
    expect(countSentences('Pierwsze zdanie. Drugie zdanie! Trzecie? Czwarte… Piąte.')).toBe(5);
  });

  it('counts a last sentence without final punctuation', () => {
    expect(countSentences('Pierwsze zdanie. Drugie bez kropki')).toBe(2);
  });

  it('does not split on decimal numbers and amounts', () => {
    expect(countSentences('Kwota wynosi 184.500,00 zł netto. Stawka VAT to 23.5 procent.')).toBe(2);
  });

  it('does not split on a lowercase word after a dot', () => {
    expect(countSentences('Umowę zawarto 12.03.2026 r. w Gdańsku. Obowiązuje 24 miesiące.')).toBe(
      2,
    );
  });

  it('tolerates "sp. z o.o." and "S.A." inside a sentence', () => {
    expect(
      countSentences(
        'Stronami są Nordwave Logistics sp. z o.o. oraz Kwadrat Software S.A. z Wrocławia. Umowa dotyczy CRM.',
      ),
    ).toBe(2);
  });

  it('does not split before a bracketed role label after "o.o." or "S.A."', () => {
    // Real Claude summary of the test PDF: 4 sentences, previously counted as 6.
    expect(
      countSentences(
        'Umowa zawarta między Nordwave Logistics sp. z o.o. (Zamawiający) a Kwadrat Software S.A. (Wykonawca) dotyczy CRM. Wdrożenie ma pięć etapów. Abonament wynosi 12 300,00 zł. Kary są limitowane.',
      ),
    ).toBe(4);
  });

  it('treats "S.A." followed by an uppercase word as the end of a sentence', () => {
    expect(countSentences('Wykonawcą jest Kwadrat Software S.A. Umowa dotyczy CRM.')).toBe(2);
  });

  it('does not split after prefix abbreviations followed by a name or number', () => {
    expect(
      countSentences(
        'Siedziba mieści się przy ul. Portowa 18, tj. Gdańsk. Kontakt: dr Nowak, prof. Kowalski i m.in. Zarząd.',
      ),
    ).toBe(2);
    expect(
      countSentences('Zgodnie z art. 5 ust. 3 pkt. 2 umowy oraz zał. Nr 4 obowiązuje kara.'),
    ).toBe(1);
    expect(countSentences('Obsługuje ok. 3400 klientów, np. firmę Nordwave. To dużo.')).toBe(2);
  });

  it('does not split after an initial', () => {
    expect(countSentences('Umowę podpisał J. Kowalski. Druga strona zaakceptowała.')).toBe(2);
  });

  it('handles "zł." at the end of a sentence', () => {
    expect(countSentences('Wynagrodzenie wynosi 184 500 zł. Płatność w 14 dni.')).toBe(2);
  });

  it('handles quotes around sentence boundaries', () => {
    expect(countSentences('Strony zwane są „Stronami”. „Umowa” wchodzi w życie w kwietniu.')).toBe(
      2,
    );
  });
});
