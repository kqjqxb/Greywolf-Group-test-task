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

  describe('scripts without letter case', () => {
    it('counts Chinese sentences ending with 。！？ without spaces', () => {
      expect(
        countSentences(
          '本合同由两家公司签订。合同金额为十万元！付款期限是多久？合同有效期为两年。',
        ),
      ).toBe(4);
    });

    it('counts Japanese sentences, also after a closing quote', () => {
      expect(
        countSentences(
          '本契約は二社間で締結された。契約金額は百万円である。「納期は三月末とする。」支払いは翌月末までに行う。',
        ),
      ).toBe(4);
    });

    it('counts Arabic sentences ending with . and ؟', () => {
      expect(
        countSentences(
          'هذا العقد بين شركتين. قيمة العقد مئة ألف دولار. ما هي مدة العقد؟ مدة العقد سنتان. يبدأ العمل في أبريل.',
        ),
      ).toBe(5);
    });

    it('counts Hebrew sentences', () => {
      expect(
        countSentences('החוזה נחתם בין שתי חברות. ערך החוזה הוא מאה אלף שקלים. החוזה תקף לשנתיים.'),
      ).toBe(3);
    });

    it('counts Hindi sentences ending with the danda', () => {
      expect(
        countSentences(
          'यह अनुबंध दो कंपनियों के बीच है। अनुबंध की राशि एक लाख रुपये है। अवधि दो साल है।',
        ),
      ).toBe(3);
    });

    it('does not count a final terminator as an extra boundary', () => {
      expect(countSentences('合同金额为十万元。')).toBe(1);
      expect(countSentences('合同金额为十万元。 ')).toBe(1);
    });

    it('does not change Latin rules: a lowercase word after a dot still does not split', () => {
      expect(countSentences('Umowę zawarto 12.03.2026 r. w Gdańsku. Obowiązuje 24 miesiące.')).toBe(
        2,
      );
    });
  });
});
