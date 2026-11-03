import { useNavigate } from 'react-router-dom';
import NewPlanModal from '../components/plans/NewPlanModal';

export default function NewPlanPage() {
  const navigate = useNavigate();
  return (
    // A page on a phone, scrolling from the top; a centred card on a wide screen.
    <div className="h-full overflow-y-auto md:flex md:items-center md:justify-center md:p-4">
      <NewPlanModal onClose={() => navigate('/')} />
    </div>
  );
}
