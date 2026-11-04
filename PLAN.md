# PLAN — PDF Insight

Start: 2026-11-04 · Deadline: 24 h od otrzymania briefu · Demo: https://kqjqxb.github.io/Greywolf-Group-test-task/
Specyfikacja: [docs/BRIEF.md](docs/BRIEF.md) · Kontekst dla agentów: [CLAUDE.md](CLAUDE.md)

Zasada: najpierw działający end-to-end „szkielet” na produkcji, potem jakość. Demo online jak najwcześniej (ryzyko dyskwalifikacji).

## Decyzje (ADR w skrócie)
| # | Decyzja | Uzasadnienie | Status |
|---|---|---|---|
| D1 | Backend: Cloudflare Worker | darmowy, secrets, łatwy CORS i rate limit, brak cold startu | przyjęte |
| D2 | LLM: Claude Haiku 5.5 (główny) → Gemini Flash → Gemini Flash-Lite (fallback) | darmowy Gemini: 20 zapytań/dzień/model i częste 503; Haiku ≈ $0,0023/analizę, stabilny, API nie trenuje na danych; budżet chroniony dziennym limitem w KV + kredyt prepaid | przyjęte (zmienione w Etapie 4) |
| D3 | Ekstrakcja tekstu w przeglądarce (pdf.js), do API trafia tylko tekst | mniejszy payload, plik nie opuszcza przeglądarki w całości | przyjęte |
| D4 | OCR: tesseract.js tylko dla stron bez warstwy tekstowej | test PDF ma skan aneksu (str. 11) — zmienia kwoty | przyjęte (assety self-hosted, CSP bez zmian) |
| D5 | Jeden schemat Zod współdzielony przez front i worker | jedno źródło prawdy, testy Vitest | przyjęte |
| D6 | Brak routera (jeden widok) | brak problemów z routingiem na Pages | przyjęte |
| D7 | Cache wyników w KV (SHA-256 tekstu + wersja promptu, 14 dni) | recenzenci wgrywają ten sam test PDF → 0 kosztów i ~0,1 s przy powtórce | przyjęte |

## Etapy

### Etap 0 — Kontekst i setup (≈1 h)
- [x] `docs/BRIEF.md`, `CLAUDE.md`, `PLAN.md`, `AI_LOG.md`
- [x] Vite + React + TS strict, ESLint + Prettier, Vitest
- [x] Struktura `src/components`, `src/lib`, `src/api`; `worker/`
- [x] `.gitignore`, `.env.example`

### Etap 1 — Walking skeleton na produkcji (≈3 h) ⚠️ priorytet
- [x] Worker: endpoint `POST /analyze` (na razie stub, 501), CORS allowlist (lista po przecinku, dokładne dopasowanie), limit body 2 MB, `GET /health`
- [x] GitHub Actions: lint › typecheck › test › build › deploy Pages (`.github/workflows/deploy.yml`)
- [x] `base` w vite.config, `VITE_API_URL` jako variable w Actions (w kodzie; zmienną trzeba ustawić w ustawieniach repo)
- [x] Deploy workera (`wrangler deploy`), klucz przez `wrangler secret put` → https://pdf-insight-api.kqjqxb.workers.dev
- [x] ✅ Kryterium: front na Pages woła worker i dostaje odpowiedź

### Etap 2 — Rdzeń MUST (≈6 h)
- [x] F-01 Upload: drag & drop + input, walidacja typu (MIME + magic bytes `%PDF`) i rozmiaru ≤ 10 MB
- [x] F-02 pdf.js: ekstrakcja tekstu per strona, poprawny worker URL pod `base`
- [x] F-04 Schemat Zod + testy Vitest (poprawne, brakujące pola, złe daty/waluty, za mało zdań)
- [x] Worker: prompt systemowy (dane ≠ instrukcje, delimitery), structured output, walidacja, 1 retry
- [x] F-03 Podsumowanie 3–5 zdań w języku dokumentu
- [x] F-05 Widok wyników + podgląd JSON + pobranie `.json`
- [x] F-06 Stany: pusty, ładowanie (z etapami), błąd z „Spróbuj ponownie”
- [x] Informacja, że plik trafia do API AI
- [x] ✅ Kryterium: test PDF → wynik < 30 s na demo (zmierzone 15–18 s z OCR)

### Etap 3 — Bezpieczeństwo (≈2 h)
- [x] Rate limit w workerze (per IP), limit rozmiaru body
- [x] Obrona przed prompt injection: delimitery + instrukcja systemowa + walidacja wyniku
- [x] (+) Wykrywanie podejrzanych fraz i ostrzeżenie w UI („Wykryto możliwą próbę manipulacji AI”)
- [x] Sprawdzenie historii Git pod kątem sekretów (`git log -p | grep`), gitleaks w CI (opcjonalnie — nie dodany; historia sprawdzona ręcznie: 0 kluczy)

### Etap 4 — SHOULD / COULD (≈4 h)
- [x] F-08 Chunking długich dokumentów (map → reduce), łączenie i deduplikacja encji/kwot/dat
- [x] F-09 Historia analiz w localStorage (ostatnie N, z try/catch)
- [x] F-10 OCR stron bez tekstu (tesseract.js, `pol+eng`), lazy-load

### Etap 5 — Jakość AI: ewaluacja (≈2 h)
- [x] `eval/` — golden expectations dla test PDF (strony, typ, kwoty 184 500 PLN / 8 600 EUR / 890 USD, strony umowy, osoby, daty ISO, brak „1 PLN”)
- [x] Skrypt `npm run eval` — woła worker, porównuje, wypisuje wynik punktowy
- [x] Iteracje promptu z wersjonowaniem (`worker/src/ai/prompt.ts`, changelog w AI_LOG)

### Etap 6 — UX i dostępność (≈2 h)
- [x] Responsywność od 360 px, focus states, obsługa klawiaturą, kontrast WCAG AA (Etapy 2–4)
- [x] `aria-live` dla stanów ładowania/błędu
- [x] Wynik przetrwa odświeżenie strony: bieżąca analiza z historii (localStorage) + wskaźnik w `sessionStorage` (nie cookies: limit 4 KB i wysyłanie do serwera)
- [x] Ostrzeżenie `beforeunload` tylko w trakcie analizy (odczyt / OCR / AI) — po zapisaniu wyniku zbędne
- [x] Motyw jasny/ciemny: automatycznie wg `prefers-color-scheme` + przełącznik zapamiętany lokalnie, kontrast AA w obu
- [ ] (COULD, po oddaniu) Interfejs po angielsku — brief wymaga komunikatów po polsku, więc PL zostaje domyślny

### Etap 7 — Dokumentacja i oddanie (≈2 h)
- [x] README: demo, zrzut ekranu, architektura (diagram), decyzje, uruchomienie lokalne, env, ograniczenia
- [x] AI_LOG.md finalny
- [x] Końcowy przegląd: code review agentem, security review, test na czystej przeglądarce/mobile
- [x] Wysłanie linków

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
