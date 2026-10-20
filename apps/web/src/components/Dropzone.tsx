import { useRef, useState, type DragEvent } from 'react';

interface Props {
  busy: boolean;
  busyLabel: string;
  error?: string;
  /** The build, plus any .map files dropped with it (for the npm package breakdown). */
  onFiles: (build: File, maps: File[]) => void;
}

/** Splits a drop into one build file and optional source maps; returns an error message if it can't. */
export function pickFiles(files: File[]): { build: File; maps: File[] } | string {
  const builds = files.filter((f) => /\.(aab|apk|ipa)$/i.test(f.name));
  const maps = files.filter((f) => /\.map$/i.test(f.name));
  if (builds.length === 0) {
    return maps.length > 0
      ? 'Drop the .aab, .apk or .ipa together with the source maps.'
      : `"${files[0]?.name}" is not an .aab, .apk or .ipa file.`;
  }
  if (builds.length > 1) return 'Drop one build at a time.';
  return { build: builds[0]!, maps };
}

export function Dropzone({ busy, busyLabel, error, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const accept = (list: FileList | null | undefined) => {
    if (!list || list.length === 0) return;
    const picked = pickFiles([...list]);
    if (typeof picked === 'string') return setLocalError(picked);
    setLocalError(undefined);
    onFiles(picked.build, picked.maps);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) accept(e.dataTransfer.files);
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
            <span className="dz-hint">A 200 MB build takes about a second</span>
          </>
        ) : (
          <>
            <span className="dz-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
              </svg>
            </span>
            <strong>Drop your .aab or .apk here</strong>
            <span className="dz-hint">or click to choose a file</span>
            <span className="dz-types">
              <span>.aab</span>
              <span>.apk</span>
              <span>.map (optional)</span>
            </span>
            <span className="dz-path">android/app/build/outputs/bundle/release/app-release.aab</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept=".aab,.apk,.ipa,.map"
        multiple
        hidden
        onChange={(e) => {
          accept(e.target.files);
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
