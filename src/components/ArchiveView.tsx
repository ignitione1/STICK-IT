import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowUpRight, Layers, Reply } from 'lucide-react';
import { useDirectory } from '../directory';
import type { StickyNoteData } from '../types';
import { archiveEntries } from '../archive';
import { presets } from '../data';
import StickyNote from './StickyNote';
import ReplyTape from './ReplyTape';
import PaperSurface from './PaperSurface';

export default function ArchiveView({ notes, allNotes, boardId, onBoard, onOriginal, onArchive, onAttachment }: {
  notes: StickyNoteData[]; allNotes: StickyNoteData[]; boardId: string; onBoard: (id: string) => void;
  onOriginal: (note: StickyNoteData) => void;
  onArchive: (note: StickyNoteData, archived: boolean) => void;
  onAttachment: (note: StickyNoteData) => void;
}) {
  const { allDepartments, departments } = useDirectory();
  const entries = archiveEntries(notes, allNotes);
  const boards = [...new Set(entries.map(entry => entry.note.boardId))].map(id => ({
    id, department: allDepartments.find(department => department.boardId === id),
    entries: entries.filter(entry => entry.note.boardId === id),
    count: notes.filter(note => note.boardId === id).length,
  })).sort((a, b) => (a.department?.name ?? '').localeCompare(b.department?.name ?? '', 'ru'));
  const selected = allDepartments.find(department => department.boardId === boardId);
  const props = { readOnly: true, dragHandle: null, onToggle: () => {}, onReply: () => {}, onArchive, onAttachment };
  return <section className="archive-workspace" aria-label="Архив переписки">
    <header className="archive-navigation">
      {boardId ? <><button className="archive-back" onClick={() => onBoard('')}><ArrowLeft size={17} />Все отделы</button><div className="archive-department-heading"><span style={{ background: selected?.color ?? '#8c9b88' }} /><h2>{selected?.name ?? 'Доска отдела'}</h2></div></>
        : <div><h2>По отделам</h2><p>Выберите стопку, чтобы разложить записки.</p></div>}
    </header>
    {!entries.some(entry => !boardId || entry.note.boardId === boardId) ? <div className="archive-empty"><h2>Записок не найдено</h2><p>Измените фильтры или вернитесь к другим отделам.</p></div>
      : !boardId ? <div className="archive-stacks" aria-label="Стопки по отделам">{boards.map(board => <button type="button" key={board.id} className="archive-stack" aria-label={`Открыть архив: ${board.department?.name ?? 'Доска отдела'}`} onClick={() => onBoard(board.id)} style={{ '--stack-color': board.department?.color ?? '#8c9b88' } as CSSProperties}>
        <span className="archive-stack-art" aria-hidden="true">{[2, 1, 0].map((layer, index) => {
          const note = board.entries[index % board.entries.length].note;
          const preset = note.preset ?? note.authorSnapshot?.preset ?? 'cream';
          return <span className={`sticky-note archive-stack-sheet stack-layer-${layer}`} key={layer} style={{ '--paper-color': presets[preset].color, '--rotation': `${layer === 0 ? -3 : layer === 1 ? 4 : -7}deg` } as CSSProperties}><PaperSurface preset={preset} />{layer === 0 && <span className="archive-stack-excerpt">{note.text}</span>}</span>;
        })}<span className="archive-stack-count"><Layers size={13} />{board.count}</span></span>
        <span className="archive-stack-name"><span />{board.department?.name ?? 'Доска отдела'}<ArrowUpRight size={17} /></span>
      </button>)}</div>
        : <div className="archive-grid" key={boardId}>{entries.filter(entry => entry.note.boardId === boardId).map((entry, index) => <div className="archive-entry" key={entry.note.id} style={{ '--entry-delay': `${Math.min(index, 8) * 35}ms` } as CSSProperties}>
          {entry.original && <div className="archive-reply-context"><Reply size={14} /><div><span>Ответ на записку {entry.original.authorSnapshot?.name ?? 'сотрудника'}</span><p>{entry.original.text}</p>{!entry.original.isArchived
            ? <button onClick={() => onOriginal(entry.original!)}>К исходной записке<ArrowUpRight size={13} /></button>
            : <small>{departments.some(department => department.boardId === entry.original!.boardId)
              ? 'Исходная цепочка в архиве. Сначала восстановите её.' : 'Доска отдела закрыта. Восстановление недоступно.'}</small>}</div></div>}
          {!entry.original && <p className="archive-thread-label">{entry.replies.length ? `Записок в переписке: ${entry.replies.length + 1}` : 'Записка'}</p>}
          <div className="note-group archive-thread" data-group-id={entry.note.id}>
            <StickyNote note={entry.note} standalone={!!entry.original} {...props} />
            {!!entry.replies.length && <div className="thread-replies">{entry.replies.map((reply, replyIndex) => <div className="thread-reply" key={reply.id} style={{ marginLeft: reply.x }}>
              <StickyNote note={reply} {...props} /><ReplyTape fromId={replyIndex ? entry.replies[replyIndex - 1].id : entry.note.id} toId={reply.id} />
            </div>)}</div>}
          </div>
        </div>)}</div>}
  </section>;
}
