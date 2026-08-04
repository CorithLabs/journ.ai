import { useRef, useState } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import {
  ACCEPTED_MIME,
  FILE_MAX_BYTES,
  formatFileSize,
  isImageMime,
} from './clipboardConstants';

export interface SelectedFile {
  blob: Blob;
  fileName: string;
  fileSize: number;
  mime: string;
  /** Object URL for image preview — caller/component revokes on clear. */
  previewUrl?: string;
}

interface Props {
  file: SelectedFile | null;
  onFile: (file: SelectedFile | null) => void;
}

/**
 * Drag-and-drop / click-to-browse file picker for clipboard uploads.
 * Accepts PDF, JPG, PNG, WEBP up to 10 MB. Files over the cap are rejected
 * with an inline error BEFORE any storage. Images show a thumbnail preview;
 * PDFs show a document icon.
 */
export default function FileDropzone({ file, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = (f: File) => {
    setError(null);
    if (!ACCEPTED_MIME.includes(f.type)) {
      setError('Unsupported file type. Use PDF, JPG, PNG, or WEBP.');
      return;
    }
    // Exactly 10 MB is accepted; 10.1 MB is rejected.
    if (f.size > FILE_MAX_BYTES) {
      setError(
        `File is ${formatFileSize(f.size)} — the limit is ${formatFileSize(FILE_MAX_BYTES)}.`,
      );
      return;
    }
    const previewUrl = isImageMime(f.type) ? URL.createObjectURL(f) : undefined;
    onFile({
      blob: f,
      fileName: f.name,
      fileSize: f.size,
      mime: f.type,
      previewUrl,
    });
  };

  const clear = () => {
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    setError(null);
    onFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (file) {
    return (
      <div
        className="flex items-center gap-3 bg-surface-overlay border border-white/10 rounded-xl p-3"
        data-testid="file-preview"
      >
        {isImageMime(file.mime) && file.previewUrl ? (
          <img
            src={file.previewUrl}
            alt={`Preview of ${file.fileName}`}
            className="w-12 h-12 rounded-lg object-cover shrink-0"
            data-testid="file-thumb"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-surface-raised flex items-center justify-center shrink-0">
            <FileText size={22} className="text-accent" aria-hidden="true" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink-primary truncate" data-testid="file-name">
            {file.fileName}
          </p>
          <p className="text-xs text-ink-muted" data-testid="file-size">
            {formatFileSize(file.fileSize)}
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          className="p-1 rounded-lg text-ink-muted hover:text-status-danger focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none"
          aria-label="Remove file"
          data-testid="remove-file-btn"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) accept(f);
        }}
        className={`w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none ${
          dragOver
            ? 'border-accent bg-accent/10'
            : 'border-white/10 hover:border-accent-muted'
        }`}
        data-testid="dropzone"
        aria-label="Upload a file — drag and drop or click to browse"
      >
        <UploadCloud size={28} className="text-accent-muted" aria-hidden="true" />
        <span className="text-sm text-ink-secondary">
          Drag &amp; drop or <span className="text-accent">browse</span>
        </span>
        <span className="text-xs text-ink-muted">PDF, JPG, PNG, WEBP · max 10 MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME.join(',')}
        className="hidden"
        data-testid="file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) accept(f);
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-status-danger" data-testid="file-error">
          {error}
        </p>
      )}
    </div>
  );
}
