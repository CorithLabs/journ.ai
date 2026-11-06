import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import TodoList from '../todo/TodoList';
import ClipboardTab from './ClipboardTab';
import KnowBeforeYouGo from '../essentials/KnowBeforeYouGo';

interface Props {
  planId: string;
}

/**
 * Everything for the trip that is not the plan itself: what is still to do,
 * and what is kept — boarding passes, check-ins, booking emails.
 *
 * These were two tabs, To-Do and Clipboard, though most tasks are finished by
 * getting something the other tab kept ("Book the hotel" → the hotel's
 * email). One tab, one scroll: to do on top, saved below, and what to know
 * about each country the trip visits at the end.
 */
export default function EssentialsTab({ planId }: Props) {
  const plan = useLiveQuery(() => db.plans.get(planId), [planId]);
  return (
    <div className="h-full overflow-y-auto" data-testid="essentials-tab">
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-8 space-y-8">
        <TodoList planId={planId} />
        <ClipboardTab planId={planId} />
        {plan && <KnowBeforeYouGo plan={plan} />}
      </div>
    </div>
  );
}
