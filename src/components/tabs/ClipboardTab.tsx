import { Paperclip } from 'lucide-react';

interface Props {
  planId: string;
}

export default function ClipboardTab({ planId: _planId }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <Paperclip size={48} className="text-accent-muted mb-4" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-ink-primary mb-2">Clipboard</h2>
      <p className="text-sm text-ink-secondary">
        Save boarding passes, hotel confirmations, and important documents here.
      </p>
    </div>
  );
}
