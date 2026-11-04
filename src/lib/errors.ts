import { MAX_DOCUMENT_CHARS, MAX_FILE_SIZE_BYTES } from './limits';
import type { ApiErrorCode } from './schema';

/** Errors detected in the browser (file checks, PDF reading, network). */
export const CLIENT_ERROR_CODES = [
  'file_multiple',
  'file_not_pdf',
  'file_empty',
  'file_too_large',
  'pdf_encrypted',
  'pdf_corrupted',
  'pdf_no_text',
  'text_too_large',
  'network',
  'timeout',
  'invalid_response',
  'unknown',
] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

/** Every error the UI can show: worker codes from the contract plus client-side codes. */
export type AppErrorCode = ApiErrorCode | ClientErrorCode;

/** An error carrying a code that maps to a Polish message. */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode) {
    super(code);
    this.name = 'AppError';
    this.code = code;
  }
}

/** Turns anything caught in a `catch` into an AppError code. */
export function toErrorCode(error: unknown): AppErrorCode {
  return error instanceof AppError ? error.code : 'unknown';
}

const MB = 1024 * 1024;
const CONFIG_ERROR = 'Usługa analizy jest nieprawidłowo skonfigurowana. Spróbuj ponownie później.';
/** Same message for the browser check and the worker's 413: both mean the document is too long. */
const TOO_LONG = `Dokument jest zbyt długi do analizy (maks. ok. ${MAX_DOCUMENT_CHARS / 1000} tys. znaków).`;
const BAD_REQUEST =
  'Serwer odrzucił żądanie jako nieprawidłowe. Spróbuj ponownie lub wybierz inny plik.';

/** The single place where error codes become Polish UI messages. */
const MESSAGES: Record<AppErrorCode, string> = {
  // Client-side: file checks
  file_multiple: 'Wybierz tylko jeden plik PDF naraz.',
  file_not_pdf: 'To nie jest plik PDF. Wybierz plik z rozszerzeniem .pdf.',
  file_empty: 'Plik jest pusty.',
  file_too_large: `Plik jest za duży. Maksymalny rozmiar to ${MAX_FILE_SIZE_BYTES / MB} MB.`,
  // Client-side: PDF reading
  pdf_encrypted: 'Plik PDF jest zabezpieczony hasłem. Usuń zabezpieczenie i spróbuj ponownie.',
  pdf_corrupted: 'Nie udało się odczytać pliku PDF. Plik może być uszkodzony.',
  pdf_no_text:
    'Ten PDF nie zawiera warstwy tekstowej, a automatyczne rozpoznawanie tekstu (OCR) nie odczytało z niego treści. Spróbuj z wyraźniejszym skanem lub plikiem z tekstem.',
  text_too_large: TOO_LONG,
  // Client-side: network
  network: 'Brak połączenia z usługą analizy. Sprawdź połączenie z internetem i spróbuj ponownie.',
  timeout: 'Analiza trwała zbyt długo i została przerwana. Spróbuj ponownie.',
  invalid_response: 'Usługa analizy zwróciła nieoczekiwaną odpowiedź. Spróbuj ponownie.',
  unknown: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.',
  // Worker (ApiErrorCode)
  not_found: CONFIG_ERROR,
  method_not_allowed: CONFIG_ERROR,
  forbidden_origin: 'Ta strona nie ma dostępu do usługi analizy.',
  unsupported_media_type: BAD_REQUEST,
  invalid_json: BAD_REQUEST,
  invalid_body: BAD_REQUEST,
  payload_too_large: TOO_LONG,
  rate_limited: 'Wysłano zbyt wiele żądań. Odczekaj chwilę i spróbuj ponownie.',
  ai_unavailable: 'Usługa AI jest chwilowo niedostępna. Spróbuj ponownie za chwilę.',
  ai_invalid_response:
    'AI zwróciło wynik niezgodny ze schematem (także po ponownej próbie). Spróbuj ponownie.',
  ai_timeout: 'AI nie odpowiedziało na czas. Spróbuj ponownie.',
  internal_error: 'Wystąpił błąd serwera. Spróbuj ponownie.',
};

export function errorMessage(code: AppErrorCode): string {
  return MESSAGES[code];
}

/**
 * Codes for which re-running the same file can help. Problems with the file itself
 * (not a PDF, too large, encrypted, no text) need a different file instead.
 */
const NOT_RETRYABLE: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  'file_multiple',
  'file_not_pdf',
  'file_empty',
  'file_too_large',
  'pdf_encrypted',
  'pdf_corrupted',
  'pdf_no_text',
  'text_too_large',
  'payload_too_large',
]);

export function isRetryable(code: AppErrorCode): boolean {
  return !NOT_RETRYABLE.has(code);
}
