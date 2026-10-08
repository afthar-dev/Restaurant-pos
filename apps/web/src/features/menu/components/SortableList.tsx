import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '@/shared/ui';
import { moveBy, moveId } from '../menuOrder';

interface Row {
  id: string;
  name: string;
}

/**
 * A list that can be put in order: drag the grip with a mouse or finger, or use Move up / Move
 * down (keyboard, screen readers, one tap). `onMove` gets every id in the new order.
 */
export function SortableList<T extends Row>({
  label,
  items,
  onMove,
  render,
}: {
  label: string;
  items: T[];
  onMove: (ids: string[]) => void;
  render: (item: T) => ReactNode;
}) {
  const ids = items.map((i) => i.id);
  const [said, setSaid] = useState('');

  /** Saves the new order and says where the row went, for screen readers. */
  function move(next: string[], id: string) {
    if (next === ids) return;
    const name = items.find((i) => i.id === id)?.name ?? '';
    setSaid(`${name} moved to position ${next.indexOf(id) + 1} of ${next.length}`);
    onMove(next);
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(moveId(ids, String(active.id), String(over.id)), String(active.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul
          aria-label={label}
          className="divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              index={index}
              first={index === 0}
              last={index === items.length - 1}
              onStep={(step) => move(moveBy(ids, item.id, step), item.id)}
            >
              {render(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </DndContext>
  );
}

function SortableRow({
  item,
  index,
  first,
  last,
  onStep,
  children,
}: {
  item: Row;
  index: number;
  first: boolean;
  last: boolean;
  onStep: (step: -1 | 1) => void;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef<-1 | 1 | null>(null);
  // Ends stay focusable (aria-disabled, not disabled) so keyboard focus is never dropped.
  const step = (direction: -1 | 1, blocked: boolean) => {
    if (blocked) return;
    refocus.current = direction;
    onStep(direction);
  };
  // Moving a row in the page drops focus; once it has moved, the pressed arrow gets it back.
  useEffect(() => {
    if (refocus.current === null) return;
    (refocus.current === -1 ? upRef : downRef).current?.focus();
    refocus.current = null;
  }, [index]);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 bg-surface px-2 py-2 ${isDragging ? 'relative z-10 shadow-overlay' : ''}`}
    >
      {/* Pointer and touch only; Move up/down below are the keyboard way. */}
      <div
        aria-hidden="true"
        {...listeners}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-subtle active:cursor-grabbing"
      >
        <GripVertical className="size-5" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      <IconButton
        label={`Move ${item.name} up`}
        variant="ghost"
        ref={upRef}
        aria-disabled={first}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        icon={<ArrowUp />}
        onClick={() => step(-1, first)}
      />
      <IconButton
        label={`Move ${item.name} down`}
        variant="ghost"
        ref={downRef}
        aria-disabled={last}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        icon={<ArrowDown />}
        onClick={() => step(1, last)}
      />
    </li>
  );
}
