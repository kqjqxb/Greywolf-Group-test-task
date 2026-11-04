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

### 2. _(do uzupełnienia)_
### 3. _(do uzupełnienia)_

## Błędy AI i poprawki
| # | Co AI zrobiło źle | Jak wykryto | Poprawka |
|---|---|---|---|
| 1 | | | |

## Wnioski
_(na koniec)_
