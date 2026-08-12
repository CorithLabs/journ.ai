import { useNavigate } from 'react-router-dom';
import NewPlanModal from '../components/plans/NewPlanModal';

export default function NewPlanPage() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <NewPlanModal onClose={() => navigate('/')} />
    </div>
  );
}
