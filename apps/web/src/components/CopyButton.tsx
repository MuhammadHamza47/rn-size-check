import { useState } from 'react';

export function CopyButton({ text, label, className = 'btn' }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard can be blocked (permissions, insecure context); nothing useful to do.
        }
      }}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}
