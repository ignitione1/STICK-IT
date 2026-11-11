import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragMoveEvent, Modifier } from '@dnd-kit/core';
import { GripHorizontal, Lightbulb, SearchX } from 'lucide-react';
import type { NoteFilter, StickyNoteData } from '../types';
import StickyNote from './StickyNote';
import ReplyTape from './ReplyTape';

interface Props {
  notes: StickyNoteData[]; filter: NoteFilter; onFilter: (filter: NoteFilter) => void;
  onMove: (id: string, x: number, y: number) => void;
  onToggle: (id: string, key: 'read' | 'done') => void;
  onReply: (note: StickyNoteData) => void; onAttachment: (note: StickyNoteData) => void;
  onNewAt: (x: number, y: number) => void;
  onEdit?: (note: StickyNoteData) => void;
  onArchive?: (note: StickyNoteData, archived: boolean) => void;
  onRaise?: (id: string) => void;
  onDragging?: (value: boolean) => void;
  readOnly?: boolean;
}

function NoteGroup({ root, replies, onMeasure, onRaise, ...props }: { root: StickyNoteData; replies: StickyNoteData[]; onMeasure: (id: string, height: number) => void } & Pick<Props, 'onToggle' | 'onReply' | 'onAttachment' | 'onEdit' | 'onArchive' | 'onRaise' | 'readOnly'>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: root.id, disabled: props.readOnly });
  const measureRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (element.offsetHeight > 0) onMeasure(root.id, element.offsetHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root.id, onMeasure]);
  function handle(name: string) {
    return props.readOnly ? null : <button className="note-drag-handle" {...listeners} {...attributes} aria-label={`Переместить записку: ${name}`} aria-roledescription="перемещаемая записка" title="Потяните за верхний край, чтобы переместить записку"><GripHorizontal size={15} /></button>;
  }
  return <div ref={element => { setNodeRef(element); measureRef.current = element; }} onFocus={() => { if (!props.readOnly) onRaise?.(root.id); }} onPointerDown={() => { if (!props.readOnly) onRaise?.(root.id); }} className={`note-group ${isDragging ? 'is-dragging' : ''}`} data-group-id={root.id} style={{ left: root.x, top: root.y, transform: `translate3d(${transform?.x ?? 0}px, ${transform?.y ?? 0}px, 0)`, zIndex: isDragging ? 2147483647 : root.zIndex }}>
    <StickyNote note={root} dragHandle={handle(root.id)} {...props} />
    {replies.length > 0 && <div className="thread-replies" aria-label="Ответы на записку">{replies.map((reply, index) => <div key={reply.id} className="thread-reply" style={{ marginLeft: reply.x }}><StickyNote note={reply} dragHandle={handle(reply.id)} {...props} /><ReplyTape fromId={index === 0 ? root.id : replies[index - 1].id} toId={reply.id} /></div>)}</div>}
  </div>;
}

const screenReaderInstructions = { draggable: 'Чтобы переместить записку, нажмите пробел. Используйте стрелки для перемещения. Нажмите пробел для закрепления или Escape для отмены.' };

export default function Board({ notes, filter, onFilter, onMove, onToggle, onReply, onAttachment, onNewAt, onEdit, onArchive, onRaise, onDragging, readOnly }: Props) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { scrollBehavior: 'auto' }));
  // A filtered reply keeps its parent visible to preserve the conversation context.
  const roots = useMemo(() => notes.filter(note => !note.parentId), [notes]);
  const measure = useMemo(() => (id: string, height: number) => setHeights(previous => previous[id] === height ? previous : { ...previous, [id]: height }), []);
  const extent = roots.reduce((bounds, root) => {
    const x = moving?.id === root.id ? moving.x : root.x;
    const y = moving?.id === root.id ? moving.y : root.y;
    return { width: Math.max(bounds.width, x + 338), height: Math.max(bounds.height, y + (heights[root.id] ?? 420) + 100) };
  }, { width: 1000, height: 1160 });
  const constrain: Modifier = ({ transform, active }) => {
    const root = roots.find(note => note.id === active?.id);
    return root ? { ...transform, x: Math.max(24 - root.x, transform.x), y: Math.max(82 - root.y, transform.y) } : transform;
  };
  function dragMove(event: DragMoveEvent) {
    const root = roots.find(note => note.id === event.active.id);
    if (root) setMoving({ id: root.id, x: Math.max(24, root.x + event.delta.x), y: Math.max(82, root.y + event.delta.y) });
  }
  function dragEnd(event: DragEndEvent) {
    const root = roots.find(note => note.id === event.active.id);
    if (root) onMove(root.id, Math.max(24, root.x + event.delta.x), Math.max(82, root.y + event.delta.y));
    setMoving(null);
    onDragging?.(false);
  }
  return <div className="board-viewport" ref={viewport}>
    <div className="board-surface" style={{ width: extent.width, minHeight: extent.height }} onDoubleClick={event => {
      if (readOnly || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      onNewAt(Math.max(24, event.clientX - rect.left), Math.max(82, event.clientY - rect.top));
    }}>
      <div className="board-toolbar">
        <div className="board-tabs" aria-label="Фильтр записок">{([{ id: 'all', title: 'Все' }, { id: 'todo', title: 'Нужно действие' }, { id: 'replies', title: 'С ответами' }] as const).map(tab => <button key={tab.id} aria-pressed={filter === tab.id} className={filter === tab.id ? 'active' : ''} onClick={() => onFilter(tab.id)}>{tab.title}</button>)}</div>
      </div>
      <DndContext sensors={sensors} modifiers={[constrain]} onDragStart={event => { onDragging?.(true); onRaise?.(String(event.active.id)); }} onDragMove={dragMove} onDragEnd={dragEnd} onDragCancel={() => { setMoving(null); onDragging?.(false); }} accessibility={{ screenReaderInstructions, announcements: {
        onDragStart: () => 'Записка поднята.', onDragOver: () => undefined,
        onDragMove: () => 'Записка перемещается. Используйте стрелки для выбора положения.',
        onDragEnd: () => 'Записка закреплена.', onDragCancel: () => 'Перемещение отменено.',
      } }}>
        {roots.map(root => <NoteGroup key={root.id} root={root} replies={notes.filter(note => note.parentId === root.id).sort((a, b) => (a.replyOrder ?? 0) - (b.replyOrder ?? 0))} onMeasure={measure} onToggle={onToggle} onReply={onReply} onAttachment={onAttachment} onEdit={onEdit} onArchive={onArchive} onRaise={onRaise} readOnly={readOnly} />)}
      </DndContext>
      {roots.length === 0 && <div className="board-empty"><SearchX size={30} /><h2>Записок пока нет</h2><p>Измените фильтры или добавьте новый стикер.</p></div>}
      {!readOnly && <div className="board-hint" style={{ top: extent.height - 62 }}><Lightbulb size={23} /><span>Кликните дважды в любую свободную область доски или нажмите «+ Новый стикер» для закрепления записки.</span></div>}
    </div>
  </div>;
}
