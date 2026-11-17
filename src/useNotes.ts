import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { StickyNoteData } from './types';

export interface NoteDraft {
  id: string; boardId: string; text: string; parentId?: string; x?: number; y?: number; rotation?: number; paperSeed?: number;
  recipientEmployeeIds?: string[]; recipientDepartmentIds?: string[];
  files?: File[];
  keepAttachmentIds?: string[];
}
type WireNote = Omit<StickyNoteData, 'time'> & { createdAt: string };
export function useNotes() {
  const [notes, setNotes] = useState<StickyNoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const pending = useRef(0);
  const dragging = useRef(false);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (pending.current || dragging.current) return;
    const ticket = ++sequence.current;
    try {
      const result = await api<{ notes: WireNote[] }>('/stickers');
      if (mounted.current && ticket === sequence.current && !pending.current && !dragging.current) {
        const next = result.notes.map(note => ({ ...note, time: new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(note.createdAt)) }));
        setNotes(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
        setHasLoaded(true);
      }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить доску');
    } finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);
  async function mutate<T>(work: () => Promise<T>, id?: string) {
    pending.current++;
    sequence.current++;
    setError('');
    if (id) setPendingIds(previous => [...previous, id]);
    try { return await work(); }
    catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Изменения не сохранены');
      throw failure;
    } finally {
      pending.current--;
      if (!pending.current) {
        await refresh();
        if (mounted.current) setPendingIds([]);
      }
    }
  }
  return { notes: notes.map(note => ({ ...note, busy: pendingIds.includes(note.id) })), loading, hasLoaded, error, refresh,
    clearError: () => setError(''), setDragging: (value: boolean) => { dragging.current = value; },
    create: (draft: NoteDraft) => mutate(() => {
      const { files, ...data } = draft;
      if (!files?.length) return api<{ id: string }>('/stickers', 'POST', data);
      const form = new FormData();
      form.append('draft', JSON.stringify(data));
      for (const file of files) form.append('files', file);
      return api<{ id: string }>('/stickers/with-attachments', 'POST', form);
    }),
    edit: (note: StickyNoteData, text: string, files: File[] = [], keepAttachmentIds?: string[]) => mutate(() => {
      const data = { text, revision: note.revision, keepAttachmentIds };
      if (!files.length) return api(`/stickers/${note.id}`, 'PATCH', data);
      const form = new FormData();
      form.append('draft', JSON.stringify(data));
      for (const file of files) form.append('files', file);
      return api(`/stickers/${note.id}/with-attachments`, 'POST', form);
    }, note.id),
    mark: (note: StickyNoteData, key: 'read' | 'done') => {
      setNotes(previous => previous.map(value => value.id === note.id ? { ...value, [key]: !note[key], ...(key === 'read' && note.read ? { done: false } : {}) } : value));
      return mutate(() => api(`/stickers/${note.id}/marks`, 'PATCH', { [key]: !note[key], revision: note.revision }), note.id);
    },
    archive: (note: StickyNoteData, archived: boolean) => mutate(() => api(`/stickers/${note.id}/archive`, 'PATCH', { archived, revision: note.revision }), note.id),
    purgeArchive: (boardId: string, selected: StickyNoteData[]) => mutate(() => api<{ deleted: number; filesRemoved: boolean }>('/stickers/archive/purge', 'POST', {
      boardId, notes: selected.map(note => ({ id: note.id, revision: note.revision })),
    })),
    move: (id: string, x: number, y: number) => {
      setNotes(previous => previous.map(note => note.id === id ? { ...note, x, y } : note));
      return mutate(() => api(`/stickers/${id}/position`, 'PATCH', { x, y }));
    },
    raise: (id: string) => {
      const root = notes.find(note => note.id === id);
      if (!root || (root.zIndex ?? 0) >= Math.max(...notes.filter(note => note.boardId === root.boardId && !note.parentId && !note.isArchived).map(note => note.zIndex ?? 0))) return Promise.resolve();
      const next = Math.max(...notes.filter(note => note.boardId === root.boardId).map(note => note.zIndex ?? 0)) + 1;
      setNotes(previous => previous.map(note => note.id === id ? { ...note, zIndex: next } : note));
      return mutate(() => api(`/stickers/${id}/raise`, 'POST'));
    },
  };
}
