import { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useDirectory } from './directory';
import { loadNotes } from './storage';
import { createPaperSeed } from './paper';
import { useNotes } from './useNotes';
import { useNotificationSound } from './useNotificationSound';
import { usePush } from './usePush';
import { legacyNoteId } from './legacy';
import type { NoteDraft } from './useNotes';
import type { DepartmentId, NoteFilter, StickyNoteData, ViewId } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Board from './components/Board';
import NoteComposer from './components/NoteComposer';
import AttachmentPreview from './components/AttachmentPreview';
import ArchiveView from './components/ArchiveView';

interface ComposerState { boardId: DepartmentId; parent?: StickyNoteData; editing?: StickyNoteData; x?: number; y?: number }

function LegacyCopy({ onImport }: { onImport: (notes: StickyNoteData[]) => Promise<void> }) {
  const { currentEmployee, departments } = useDirectory();
  const [raw] = useState(() => { try { return localStorage.getItem('stickerboard:v1'); } catch { return null; } });
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('stickerboard:legacy-hidden:' + currentEmployee.id) === '1'; } catch { return false; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!raw || hidden) return null;
  const own = loadNotes().filter(note => note.authorId === currentEmployee.id && !note.parentId && departments.some(department => department.boardId === note.boardId));
  return <div className="legacy-copy"><div><strong>В браузере есть прежняя локальная копия.</strong><p>Она сохранена отдельно. Можно скачать её целиком или перенести свои основные записки на сервер. Перенос — новая публикация с текущим профилем и без прежних галочек.</p>
    {error && <p role="alert" className="account-error">{error}</p>}</div>
    <button className="secondary-button" onClick={() => {
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'stickerboard-browser-backup.json'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}><Download size={14} />Скачать копию</button>
    {!!own.length && <button className="secondary-button" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await onImport(own); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось перенести'); }
      finally { setBusy(false); }
    }}>{busy ? 'Переносим…' : 'Перенести мои записки'}</button>}
    <button className="icon-button" aria-label="Скрыть сообщение о локальной копии" onClick={() => {
      setHidden(true); try { localStorage.setItem('stickerboard:legacy-hidden:' + currentEmployee.id, '1'); } catch { /* The copy itself is never modified. */ }
    }}><X size={15} /></button>
  </div>;
}

export default function App() {
  const { currentEmployee, departments, allDepartments, employees } = useDirectory();
  const sync = useNotes();
  const notes = sync.notes;
  const push = usePush(currentEmployee.id, () => sound.play(), () => sound.isEnabled(), () => sound.isReady());
  const sound = useNotificationSound(notes, sync.hasLoaded, currentEmployee.id, push.enabled);
  const homeBoard = departments.find(item => item.id === currentEmployee.department)?.boardId ?? departments[0]?.boardId ?? '';
  const [view, setView] = useState<ViewId>(() => new URLSearchParams(window.location.search).get('view') === 'notifications' ? 'notifications' : homeBoard);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<DepartmentId | 'all'>('all');
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [attachment, setAttachment] = useState<StickyNoteData | null>(null);
  const [sender, setSender] = useState('');
  const [receiver, setReceiver] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [archiveBoard, setArchiveBoard] = useState('');

  useEffect(() => {
    document.title = (departments.find(item => item.boardId === view)?.name ?? (view === 'mine' ? 'Мои записки' : view === 'archive' ? 'Архив' : 'Уведомления')) + ' — Stick-it';
  }, [view, departments]);
  useEffect(() => {
    const open = () => setView('notifications');
    window.addEventListener('stickit:open-notifications', open);
    return () => window.removeEventListener('stickit:open-notifications', open);
  }, []);
  useEffect(() => {
    if (!['mine', 'notifications', 'archive'].includes(view) && !departments.some(item => item.boardId === view)) setView(homeBoard);
  }, [departments, homeBoard, view]);

  const notifications = notes.filter(note => !note.isArchived && note.isRecipient && !note.read && note.authorId !== currentEmployee.id);
  const viewNotes = useMemo(() => {
    const active = notes.filter(note => !note.isArchived);
    if (view === 'archive') {
      const matching = notes.filter(note => note.isArchived
        && (!sender || note.authorId === sender)
        && (!receiver || (receiver.startsWith('employee:') ? note.recipientEmployeeIds?.includes(receiver.slice(9)) : note.recipientDepartmentIds?.includes(receiver.slice(11))))
        && (!from || new Date(note.createdAt!).getTime() >= new Date(from + 'T00:00:00').getTime())
        && (!to || new Date(note.createdAt!).getTime() <= new Date(to + 'T23:59:59.999').getTime()));
      return matching;
    }
    if (view === 'mine' || view === 'notifications') {
      const matching = active.filter(note => view === 'mine' ? note.authorId === currentEmployee.id : note.isRecipient && !note.read && note.authorId !== currentEmployee.id);
      const roots = new Set(matching.map(note => note.parentId ?? note.id));
      return active.filter(note => roots.has(note.parentId ?? note.id));
    }
    return active.filter(note => note.boardId === view);
  }, [notes, view, currentEmployee.id, sender, receiver, from, to]);

  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    if (view === 'archive') return viewNotes.filter(note => !needle || (note.text + ' ' + (note.authorSnapshot?.label ?? employees[note.authorId]?.label ?? '')
      + ' ' + (note.departmentSnapshot?.name ?? '') + ' ' + (note.attachments?.map(file => file.name).join(' ') ?? note.attachment?.name ?? '')).toLocaleLowerCase('ru').includes(needle));
    const roots = viewNotes.filter(note => !note.parentId).filter(root => {
      const thread = viewNotes.filter(note => note.id === root.id || note.parentId === root.id);
      if (filter === 'todo' && thread.every(note => note.done)) return false;
      if (filter === 'replies' && thread.length < 2) return false;
      return thread.some(note => {
        const author = note.authorSnapshot ?? employees[note.authorId];
        if (!author) return false;
        const name = note.departmentSnapshot?.name ?? '';
        return (department === 'all' || author.department === department)
          && (!needle || (note.text + ' ' + author.label + ' ' + name + ' ' + (note.attachments?.map(file => file.name).join(' ') ?? note.attachment?.name ?? '')).toLocaleLowerCase('ru').includes(needle));
      });
    });
    const ids = new Set(roots.map(root => root.id));
    return viewNotes.filter(note => ids.has(note.parentId ?? note.id));
  }, [viewNotes, filter, department, query, employees, view]);

  function changeView(next: ViewId) { setView(next); setQuery(''); setDepartment('all'); setFilter('all'); }
  function openNew(x?: number, y?: number) { if (view !== 'archive') setComposer({ boardId: ['mine', 'notifications'].includes(view) ? homeBoard : view, x, y }); }
  async function createNote(draft: NoteDraft) {
    if (!composer) return;
    if (composer.editing) await sync.edit(composer.editing, draft.text, draft.files, draft.keepAttachmentIds);
    else await sync.create({ ...draft, parentId: composer.parent?.parentId ?? composer.parent?.id,
      x: composer.x ?? 80 + (notes.filter(note => note.boardId === draft.boardId && !note.parentId).length % 4) * 32,
      y: composer.y ?? 100, rotation: composer.parent ? 1.2 : -1.5, paperSeed: createPaperSeed() });
    setComposer(null);
    if (!composer.editing) changeView(draft.boardId);
    window.setTimeout(() => document.querySelector('[data-note-id="' + draft.id + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 80);
  }
  function archive(note: StickyNoteData, archived: boolean) {
    if (archived && !window.confirm(note.parentId ? 'Отправить этот ответ в архив? Исходная записка и остальные ответы останутся на доске.'
      : 'Отправить записку и всю её цепочку ответов в архив? Отдельно архивированные ответы сохранят свой статус.')) return;
    void sync.archive(note, archived).catch(() => {});
  }
  function openAttachment(note: StickyNoteData) {
    const file = note.attachment;
    if (file?.id && file.available !== false && file.kind === 'document') {
      const link = document.createElement('a');
      link.href = '/api/attachments/' + file.id + '/download'; link.download = file.name;
      document.body.append(link); link.click(); link.remove();
    } else setAttachment(note);
  }
  const authors = [...new Map(notes.filter(note => note.authorSnapshot).map(note => [note.authorId, note.authorSnapshot!])).values()];
  return <div className="app">
    <Sidebar view={view} onChange={changeView} unread={notifications.length} soundEnabled={sound.enabled} onToggleSound={sound.toggle} pushEnabled={push.enabled} onTogglePush={push.toggle} pushError={push.error} open={menuOpen} onClose={() => setMenuOpen(false)} />
    <main className="main">
      <Header view={view} count={view === 'archive' ? visibleNotes.filter(note => !archiveBoard || note.boardId === archiveBoard).length : viewNotes.length} query={query} department={department} onQuery={setQuery} onDepartment={setDepartment} onNew={() => openNew()} onMenu={() => setMenuOpen(true)} />
      <LegacyCopy onImport={async previous => {
        for (const note of previous) await sync.create({ id: await legacyNoteId(currentEmployee.id, note.id), boardId: note.boardId,
          text: note.text, x: note.x, y: note.y, rotation: note.rotation, paperSeed: note.paperSeed });
      }} />
      {view === 'archive' && <div className="archive-filters">
        <label>Отдел<select aria-label="Отдел архива" value={archiveBoard} onChange={event => setArchiveBoard(event.target.value)}><option value="">Все отделы — стопками</option>{allDepartments.map(item => <option key={item.boardId} value={item.boardId}>{item.name}</option>)}</select></label>
        <label>Отправитель<select aria-label="Отправитель архива" value={sender} onChange={event => setSender(event.target.value)}><option value="">Все отправители</option>{authors.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label>Получатель<select aria-label="Получатель архива" value={receiver} onChange={event => setReceiver(event.target.value)}><option value="">Все получатели</option>{Object.values(employees).map(person => <option key={person.id} value={'employee:' + person.id}>{person.name}</option>)}{allDepartments.filter(item => !item.isGeneral).map(item => <option key={item.id} value={'department:' + item.id}>{item.name}</option>)}</select></label>
        <label>Создано с<input type="date" aria-label="Начало периода архива" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label>По<input type="date" aria-label="Конец периода архива" min={from} value={to} onChange={event => setTo(event.target.value)} /></label>
        <button className="secondary-button archive-reset" disabled={!archiveBoard && !sender && !receiver && !from && !to && !query} onClick={() => {
          setArchiveBoard(''); setSender(''); setReceiver(''); setFrom(''); setTo(''); setQuery('');
        }}>Сбросить фильтры</button>
      </div>}
      {sync.loading && <div className="sync-message" role="status">Загружаем записки с сервера…</div>}
      {sync.error && <div className="sync-error" role="alert"><span>{sync.error}</span><button onClick={() => { sync.clearError(); void sync.refresh(); }}>Обновить доску</button></div>}
      {!sync.loading && view === 'archive' && <ArchiveView notes={visibleNotes} allNotes={notes} boardId={archiveBoard} onBoard={setArchiveBoard} onOriginal={note => {
        changeView(note.boardId);
        window.setTimeout(() => document.querySelector('[data-note-id="' + note.id + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 80);
      }} onArchive={archive} onAttachment={openAttachment} />}
      {!sync.loading && view !== 'archive' && <Board key={view} notes={visibleNotes} filter={filter} onFilter={setFilter}
        readOnly={view === 'archive'} onDragging={sync.setDragging}
        onMove={(id, x, y) => { void sync.move(id, x, y).catch(() => {}); }}
        onRaise={id => { void sync.raise(id).catch(() => {}); }}
        onToggle={(id, key) => { const note = notes.find(note => note.id === id); if (note) void sync.mark(note, key).catch(() => {}); }}
        onEdit={note => setComposer({ boardId: note.boardId, editing: note })} onArchive={archive}
        onReply={note => setComposer({ boardId: note.boardId, parent: note })} onAttachment={openAttachment} onNewAt={openNew} />}
    </main>
    {composer && <NoteComposer boardId={composer.boardId} parent={composer.parent} editing={composer.editing} onClose={() => setComposer(null)} onSubmit={createNote} />}
    {attachment?.attachment && <AttachmentPreview file={attachment.attachment} onClose={() => setAttachment(null)} />}
  </div>;
}
