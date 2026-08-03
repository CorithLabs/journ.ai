import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={24} className="text-accent" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-ink-primary tracking-tight">
          Settings
        </h1>
      </div>
      <p className="text-sm text-ink-secondary">
        AI provider configuration will appear here in a future update.
      </p>
    </div>
  );
}
