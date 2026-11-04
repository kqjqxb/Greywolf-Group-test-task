import { useEffect, useId, useState, type ChangeEvent, type DragEvent, type Ref } from 'react';
import { MAX_FILE_SIZE_BYTES } from '../lib/limits';
import { MAX_OCR_PAGES } from '../lib/pdfText';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  /** Lets the parent move focus to the file input (e.g. after "Wybierz inny plik"). */
  inputRef?: Ref<HTMLInputElement>;
}

const MAX_MB = MAX_FILE_SIZE_BYTES / (1024 * 1024);

/**
 * F-01: drag & drop area + a real file input. The input is visually hidden but stays
 * focusable, so keyboard users open the file dialog with Enter/Space; its label is the
 * visible button.
 */
export function UploadZone({ onFiles, inputRef }: UploadZoneProps) {
  const inputId = useId();
  const hintId = useId();
  const [isDragOver, setIsDragOver] = useState(false);

  // A PDF dropped next to the zone would make the browser open it and leave the app.
  useEffect(() => {
    const preventNavigation = (event: globalThis.DragEvent) => event.preventDefault();
    window.addEventListener('dragover', preventNavigation);
    window.addEventListener('drop', preventNavigation);
    return () => {
      window.removeEventListener('dragover', preventNavigation);
      window.removeEventListener('drop', preventNavigation);
    };
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Clear the value so choosing the same file again still fires `change`.
    event.target.value = '';
    if (files.length > 0) {
      onFiles(files);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    // Ignore leaving into a child element of the zone.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onFiles(files);
    }
  }

  return (
    <div
      className={`dropzone${isDragOver ? ' dropzone--active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <svg className="dropzone__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" />
      </svg>
      <p className="dropzone__title">Przeciągnij i upuść plik PDF tutaj</p>
      <p className="dropzone__or">lub</p>
      <input
        ref={inputRef}
        id={inputId}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        aria-describedby={hintId}
        onChange={handleChange}
      />
      <label htmlFor={inputId} className="button button--primary">
        Wybierz plik PDF
      </label>
      <p id={hintId} className="dropzone__hint">
        Pliki PDF do {MAX_MB} MB. Zeskanowane strony (bez warstwy tekstowej) zostaną rozpoznane
        automatycznie (OCR, maks. {MAX_OCR_PAGES} stron).
      </p>
    </div>
  );
}
