import { useRef, useState, type DragEvent } from 'react';

interface Props {
  busy: boolean;
  busyLabel: string;
  error?: string;
  onFile: (file: File) => void;
}

export function Dropzone({ busy, busyLabel, error, onFile }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (/\.ipa$/i.test(file.name)) return setLocalError('iOS .ipa files are coming soon. For now, drop an Android .aab or .apk.');
    if (!/\.(aab|apk)$/i.test(file.name)) return setLocalError(`"${file.name}" is not an .aab or .apk file.`);
    setLocalError(undefined);
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) accept(e.dataTransfer.files[0]);
  };

  const shownError = localError ?? error;
  return (
    <div className="dropzone-wrap">
      <button
        type="button"
        className={`dropzone${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
        onClick={() => !busy && input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={busy}
      >
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            <strong>{busyLabel}</strong>
            <span className="dz-hint">Usually takes a second or two</span>
          </>
        ) : (
          <>
            <span className="dz-icon" aria-hidden="true">
              ⬇
            </span>
            <strong>Drop your .aab or .apk here</strong>
            <span className="dz-hint">or click to choose a file</span>
            <span className="dz-path">android/app/build/outputs/bundle/release/app-release.aab</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept=".aab,.apk"
        hidden
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {shownError && (
        <p className="error" role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}
