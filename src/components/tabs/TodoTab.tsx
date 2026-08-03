import TodoList from '../todo/TodoList';

interface Props {
  planId: string;
}

export default function TodoTab({ planId }: Props) {
  return <TodoList planId={planId} />;
}
