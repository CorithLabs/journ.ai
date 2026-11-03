import TodoList from '../todo/TodoList';
import ClipboardTab from './ClipboardTab';

interface Props {
  planId: string;
}

/**
 * Everything for the trip that is not the plan itself: what is still to sort,
 * and what is kept — boarding passes, check-ins, booking emails.
 *
 * These were two tabs, To-Do and Clipboard, though most tasks are finished by
 * getting something the other tab kept ("Book the hotel" → the hotel's
 * email). One tab, one scroll: to sort on top, saved below.
 */
export default function EssentialsTab({ planId }: Props) {
  return (
    <div className="h-full overflow-y-auto" data-testid="essentials-tab">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-8 space-y-8">
        <TodoList planId={planId} />
        <ClipboardTab planId={planId} />
      </div>
    </div>
  );
}
