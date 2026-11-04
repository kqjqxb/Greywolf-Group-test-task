# AI_LOG — praca z AI

## Narzędzia
- **Claude Code** (Opus 5.5, rozszerzenie VS Code) — główny agent: planowanie, implementacja, review.
- _(uzupełnić: inne narzędzia, jeśli użyte)_

## Podejście (context engineering)
1. Przed pierwszą linijką kodu: brief przepisany do `docs/BRIEF.md` (źródło prawdy dla agentów), łącznie z analizą pułapek w pliku testowym.
2. `CLAUDE.md` z twardymi regułami (sekrety, brak `any`, PDF = dane) — agent ładuje je w każdej sesji.
3. `PLAN.md` z etapami, kryteriami akceptacji i decyzjami — agent odhacza postęp.
4. Weryfikacja zamiast zaufania: lint, typecheck, testy, eval na pliku testowym.

## Kluczowe prompty
### 1. Analiza briefu
> „Dali mi zadanie testowe (w plikach) — przejrzyj, co trzeba zrobić, i powiedz mi.”

Efekt: streszczenie wymagań + wykrycie pułapek w test PDF (prompt injection na str. 4, skan bez warstwy tekstowej na str. 11, wiele walut).

### 2. Kontekst przed kodem (Etap 0)
> „Implement Stage 0 of PLAN.md. Read first, in this order: CLAUDE.md, docs/BRIEF.md, PLAN.md. They are the source of truth… Do NOT commit or push. I will review the diff and commit myself. Final report: … any deviation from this prompt or anything that went wrong — I log AI mistakes in AI_LOG.md.”

Wzorzec użyty w każdym kolejnym etapie: agent startuje w **nowym czacie** bez historii, cały stan bierze z repo (CLAUDE.md / BRIEF / PLAN), nie commituje, a raport kończy listą odchyleń i błędów. Commit dopiero po moim review diffu.

### 3. Kontrakt przed równoległą pracą (Etap 2)
Zanim rozdzieliłem pracę, sam zdefiniowałem kontrakt `src/lib/schema.ts` (request, wynik, kody błędów) + fixture. Potem dwa agenty równolegle, każdy w osobnym **git worktree** i na osobnej gałęzi:
> 2A: „You are the backend agent… Work EXCLUSIVELY in the git worktree …/Greywolf-stage2-worker… CONTRACT: src/lib/schema.ts — do NOT change its shapes. If you believe a change is needed, stop and report it instead.”
>
> 2B: „You are the frontend agent… The worker isn't ready yet: develop against src/lib/fixtures/sample-result.ts through a dev-only mock (tree-shaken from production).”

Efekt: obie gałęzie zmergowane bez konfliktów, żaden agent nie musiał zmieniać kontraktu, 117 testów zielonych po merge.

### 4. Weryfikacja na prawdziwym pliku zamiast „wygląda dobrze”
> „Real check: … POST the test PDF text to /analyze… check it against docs/BRIEF.md "znane pułapki": the injection on page 4 must be ignored (no "nieważna", no 1 PLN; 184 500 PLN present), EUR/USD amounts present, language "pl", dates ISO. Report the latency.”

Wynik: injection zignorowany, wszystkie waluty, 22 daty w ISO, 13,9 s.

### 5. Decyzja oparta na pomiarach, nie na założeniach (Etap 3 → 4)
Agent z Etapu 3 zmierzył 5 modeli Gemini na test PDF i odkrył limit **20 zapytań/dzień/model** w darmowym planie (oraz 30–40% odpowiedzi 503). Zamiast łatać fallbackami zmieniłem architekturę:
> „Decision (made by the owner): Claude Haiku 5.5 becomes the PRIMARY model; the existing Gemini primary + fallback become the fallback chain. The Anthropic key is prepaid credit (~$4) — protecting the budget is a hard requirement.”

Trzy warstwy ochrony budżetu: kredyt prepaid (twardy limit), dzienny licznik wywołań Claude w KV (150/dzień → potem Gemini), cache wyników (powtórna analiza = 0 kosztu). Zmierzony koszt: **$0,0023 / analizę, 7,2 s**, z cache **129 ms**.

### Changelog promptu
| Wersja | Zmiana | Powód |
|---|---|---|
| 1.0.0 | system prompt z regułami bezpieczeństwa, dokument w delimiterach, structured output | Etap 2 |
| 1.1.0 | jedna pozycja na datę (scalone konteksty), pełna lista kwot, aneksy aktualizują wartości w podsumowaniu | ręczny review wyniku na demo: 28 dat z duplikatami, brak części kwot |

## Błędy AI i poprawki
| # | Co AI zrobiło źle | Jak wykryto | Poprawka |
|---|---|---|---|
| 1 | Agent instalował wszystkie pakiety w najnowszych wersjach bez sprawdzenia kompatybilności → `npm install` padł (ERESOLVE: eslint-plugin-react nie wspiera ESLint 10; typescript-eslint wymaga TS < 6.1) | błąd instalacji | przypięte `eslint@9`, `typescript@~6.0`, powód zapisany w CLAUDE.md, żeby kolejne sesje agenta tego nie „naprawiały” |
| 2 | `npm install` uruchomiony przed utworzeniem `.gitignore` → VS Code pokazał ~10K zmian (node_modules) | licznik zmian w IDE | weryfikacja `git status` przed commitem; zasada: commit tylko po review diffu |
| 3 | `@cloudflare/workers-types` typuje `request.body` jako `ReadableStream<any>` — `tsc` przechodził, ale `any` przeciekało do kodu workera | type-aware ESLint (3× `no-unsafe-*`) | jawne `as ReadableStream<Uint8Array>` z komentarzem; dowód, że sam `tsc` nie wystarcza do reguły „zero any” |
| 4 | Agent napisał błędny test liczenia zdań („np. Firmę X. To dużo.” → oczekiwał 2), choć „X.” to inicjał | czerwony test | poprawiony test, nie funkcja — najpierw sprawdzić, czy myli się kod, czy oczekiwanie |
| 5 | Pierwsza wersja wywołania Gemini bez `thinkingLevel` — 17–20 s, tuż przy timeoucie 20 s | pomiar latencji na realnym PDF | `thinkingLevel: LOW` → 12,7–14,9 s |
| 6 | Agent błędnie uznał, że nowy parametr `thinkingLevel` powoduje 502 | bezpośrednie zapytanie do Gemini (bez logowania klucza) | prawdziwa przyczyna: upstream 503 „high demand” → zadanie na fallback modelu |
| 7 | Uruchomienie `vitest --root /` zaczęło skanować cały dysk | obserwacja procesu | przerwane; zasada: narzędzia tylko w katalogu projektu |
| 8 | Test „Spróbuj ponownie” znajdował ukryty region `aria-live` z tym samym tekstem zamiast przycisku | czerwony test | wyszukiwanie po roli (`getByRole('button')`) |
| 9 | Agent 4A zdiagnozował 502 jako „model pisze 6 zdań” i zaostrzył prompt | drugi przebieg z zapisanym surowym wynikiem: było 4 zdania | prawdziwy błąd: `countSentences` dzielił na „o.o.” i „S.A.”; poprawiony regex + test regresyjny z prawdziwego podsumowania. Lekcja: zapisuj surowy output przy pierwszej diagnozie |
| 10 | Założenie, że SDK Anthropic wysyła klucz w `x-api-key` (SDK 1.x używa `Authorization`) | test z fałszywym `fetch` | poprawiony test; nie zgadywać kształtu API |
| 11 | Pomiar 5× na głównym modelu zużył dzienny limit Gemini, zanim agent sprawdził `quotaId` | 429 utrzymujące się po kilku minutach | ograniczenie pomiarów do 3/model; limit RPD → zmiana decyzji D2 |
| 12 | `useGrouping: 'always'` — testy Vitest zielone, `tsc` odrzucił typ | dopiero `npm run build` | `ES2023.Intl` w `lib`; Vitest nie sprawdza typów — zawsze pełny zestaw kontroli |
| 13 | Zod sprawdza `new Function` → naruszenie CSP przypisane najpierw pdf.js | nasłuch `securitypolicyviolation` | `z.config({ jitless: true })` |
| 14 | tesseract.js zawieszał się bez błędu (zapis cache do IndexedDB nigdy się nie kończył) | OCR „pending” w headless Chrome | `cacheMethod: 'none'`; potwierdzone włączeniem/wyłączeniem |
| 15 | `createWorker` połyka błędy startu → ścieżka „OCR nie działa” też się zawieszała | zablokowanie plików językowych w przeglądarce | wrapper odrzucający przez `errorHandler` + 30 s timeout |
| 16 | „Szary” przycisk „Pobierz JSON” zgłoszony jako bug UI | analiza: przy druku do PDF przeglądarka pomija tła → biały tekst na białym | style `@media print` zamiast „naprawiania” przycisku |

## Wnioski
_(na koniec)_
