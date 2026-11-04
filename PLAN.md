# PLAN — PDF Insight

Start: 2026-11-04 · Deadline: 24 h od otrzymania briefu · Demo: https://kqjqxb.github.io/Greywolf-Group-test-task/
Specyfikacja: [docs/BRIEF.md](docs/BRIEF.md) · Kontekst dla agentów: [CLAUDE.md](CLAUDE.md)

Zasada: najpierw działający end-to-end „szkielet” na produkcji, potem jakość. Demo online jak najwcześniej (ryzyko dyskwalifikacji).

## Decyzje (ADR w skrócie)
| # | Decyzja | Uzasadnienie | Status |
|---|---|---|---|
| D1 | Backend: Cloudflare Worker | darmowy, secrets, łatwy CORS i rate limit, brak cold startu | proponowane |
| D2 | LLM: Gemini Flash (free tier), tryb JSON / responseSchema | darmowe limity, długi kontekst, natywne structured output | do potwierdzenia |
| D3 | Ekstrakcja tekstu w przeglądarce (pdf.js), do API trafia tylko tekst | mniejszy payload, plik nie opuszcza przeglądarki w całości | proponowane |
| D4 | OCR: tesseract.js tylko dla stron bez warstwy tekstowej | test PDF ma skan aneksu (str. 11) — zmienia kwoty | proponowane |
| D5 | Jeden schemat Zod współdzielony przez front i worker | jedno źródło prawdy, testy Vitest | proponowane |
| D6 | Brak routera (jeden widok) | brak problemów z routingiem na Pages | proponowane |

## Etapy

### Etap 0 — Kontekst i setup (≈1 h)
- [x] `docs/BRIEF.md`, `CLAUDE.md`, `PLAN.md`, `AI_LOG.md`
- [ ] Vite + React + TS strict, ESLint + Prettier, Vitest
- [ ] Struktura `src/components`, `src/lib`, `src/api`; `worker/`
- [ ] `.gitignore`, `.env.example`

### Etap 1 — Walking skeleton na produkcji (≈3 h) ⚠️ priorytet
- [ ] Worker: endpoint `POST /analyze` (na razie stub), CORS allowlist
- [ ] GitHub Actions: lint › typecheck › test › build › deploy Pages
- [ ] `base` w vite.config, `VITE_API_URL` jako secret/variable w Actions
- [ ] Deploy workera (`wrangler deploy`), klucz przez `wrangler secret put`
- [ ] ✅ Kryterium: front na Pages woła worker i dostaje odpowiedź

### Etap 2 — Rdzeń MUST (≈6 h)
- [ ] F-01 Upload: drag & drop + input, walidacja typu (MIME + magic bytes `%PDF`) i rozmiaru ≤ 10 MB
- [ ] F-02 pdf.js: ekstrakcja tekstu per strona, poprawny worker URL pod `base`
- [ ] F-04 Schemat Zod + testy Vitest (poprawne, brakujące pola, złe daty/waluty, za mało zdań)
- [ ] Worker: prompt systemowy (dane ≠ instrukcje, delimitery), structured output, walidacja, 1 retry
- [ ] F-03 Podsumowanie 3–5 zdań w języku dokumentu
- [ ] F-05 Widok wyników + podgląd JSON + pobranie `.json`
- [ ] F-06 Stany: pusty, ładowanie (z etapami), błąd z „Spróbuj ponownie”
- [ ] Informacja, że plik trafia do API AI
- [ ] ✅ Kryterium: test PDF → wynik < 30 s na demo

### Etap 3 — Bezpieczeństwo (≈2 h)
- [ ] Rate limit w workerze (per IP), limit rozmiaru body
- [ ] Obrona przed prompt injection: delimitery + instrukcja systemowa + walidacja wyniku
- [ ] (+) Wykrywanie podejrzanych fraz i ostrzeżenie w UI („Wykryto możliwą próbę manipulacji AI”)
- [ ] Sprawdzenie historii Git pod kątem sekretów (`git log -p | grep`), gitleaks w CI (opcjonalnie)

### Etap 4 — SHOULD / COULD (≈4 h)
- [ ] F-08 Chunking długich dokumentów (map → reduce), łączenie i deduplikacja encji/kwot/dat
- [ ] F-09 Historia analiz w localStorage (ostatnie N, z try/catch)
- [ ] F-10 OCR stron bez tekstu (tesseract.js, `pol+eng`), lazy-load

### Etap 5 — Jakość AI: ewaluacja (≈2 h)
- [ ] `eval/` — golden expectations dla test PDF (strony, typ, kwoty 184 500 PLN / 8 600 EUR / 890 USD, strony umowy, osoby, daty ISO, brak „1 PLN”)
- [ ] Skrypt `npm run eval` — woła worker, porównuje, wypisuje wynik punktowy
- [ ] Iteracje promptu z wersjonowaniem (`worker/src/prompt.ts`, changelog w AI_LOG)

### Etap 6 — UX i dostępność (≈2 h)
- [ ] Responsywność od 360 px, focus states, obsługa klawiaturą, kontrast WCAG AA
- [ ] `aria-live` dla stanów ładowania/błędu

### Etap 7 — Dokumentacja i oddanie (≈2 h)
- [ ] README: demo, zrzut ekranu, architektura (diagram), decyzje, uruchomienie lokalne, env, ograniczenia
- [ ] AI_LOG.md finalny
- [ ] Końcowy przegląd: code review agentem, security review, test na czystej przeglądarce/mobile
- [ ] Wysłanie linków

## Praca z agentami
- Równoległe ścieżki (subagenci, osobne worktree): **A** frontend UI · **B** worker + prompt · **C** schemat + testy + eval.
- Kontrakt między ścieżkami = `src/lib/schema.ts` + `docs/BRIEF.md` — ustalony przed rozdzieleniem pracy.
- Każda ścieżka kończy się: lint + typecheck + testy zielone, wpis w PLAN.md.

## Ryzyka
| Ryzyko | Mitygacja |
|---|---|
| Limity darmowego API / 429 | rate limit po naszej stronie, komunikat PL, fallback model |
| > 30 s dla długich PDF | równoległe chunki, szybki model, przycięcie tekstu z informacją |
| Zły worker pdf.js na Pages | import `?url` z Vite, test na deployu w Etapie 1 |
| Halucynacje / format | structured output + Zod + retry + eval |
