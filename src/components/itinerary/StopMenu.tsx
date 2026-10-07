import { ArrowDown, ArrowUp, MapPin, Pencil, Pin, Trash2 } from 'lucide-react';
import ActionMenu from '../ui/ActionMenu';

interface Props {
  name: string;
  mapsUrl: string | null;
  pinned: boolean;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Undefined when the stop is already first or last of the day. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

/**
 * Everything you can do to a stop in the itinerary. Each item keeps the
 * accessible name the old rail button had.
 */
export default function StopMenu({ name, mapsUrl, pinned, onPin, onEdit, onDelete, onMoveUp, onMoveDown }: Props) {
  return (
    <div className="-my-1.5 -mr-2">
      <ActionMenu
        label={`More actions for ${name}`}
        menuLabel={`Actions for ${name}`}
        buttonTestId="stop-menu-button"
        menuTestId="stop-menu"
        items={[
          ...(mapsUrl
            ? [{ label: 'Directions', ariaLabel: `Open ${name} in Google Maps`, icon: <MapPin size={15} />, href: mapsUrl, testId: 'activity-maps' }]
            : []),
          {
            label: pinned ? 'Unpin from to-do' : 'Pin to to-do',
            ariaLabel: pinned ? 'Unpin from to-do' : 'Pin to to-do',
            icon: <Pin size={15} />,
            onSelect: onPin,
          },
          { label: 'Edit', ariaLabel: 'Edit activity', icon: <Pencil size={15} />, onSelect: onEdit },
          { label: 'Move earlier', ariaLabel: `Move ${name} up`, icon: <ArrowUp size={15} />, onSelect: onMoveUp, disabled: !onMoveUp },
          { label: 'Move later', ariaLabel: `Move ${name} down`, icon: <ArrowDown size={15} />, onSelect: onMoveDown, disabled: !onMoveDown },
          { label: 'Delete', ariaLabel: 'Delete activity', icon: <Trash2 size={15} />, onSelect: onDelete, danger: true },
        ]}
      />
    </div>
  );
}
