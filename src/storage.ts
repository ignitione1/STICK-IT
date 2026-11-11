import { presets } from './data';
import type { StickyNoteData, StoredBoard } from './types';
import { isPaperSeed, paperSeedFromId } from './paper';

export const STORAGE_KEY = 'stickerboard:v1';
const validDepartment = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128;
function validAuthor(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const person = value as Record<string, unknown>;
  return ['id', 'name', 'label', 'department', 'avatar'].every(key => typeof person[key] === 'string')
    && typeof person.preset === 'string' && Object.hasOwn(presets, person.preset);
}

function isNote(value: unknown): value is StickyNoteData {
  if (!value || typeof value !== 'object') return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === 'string' && validDepartment(note.boardId)
    && typeof note.authorId === 'string' && note.authorId.length > 0
    && (note.preset === undefined || (typeof note.preset === 'string' && Object.hasOwn(presets, note.preset)))
    && (note.fastening === undefined || ['pin', 'clip', 'tape', 'fold'].includes(String(note.fastening)))
    && (note.authorSnapshot === undefined || validAuthor(note.authorSnapshot))
    && (note.departmentSnapshot === undefined || (note.departmentSnapshot !== null && typeof note.departmentSnapshot === 'object'
      && ['id', 'name', 'color', 'stamp'].every(key => typeof (note.departmentSnapshot as Record<string, unknown>)[key] === 'string')))
    && typeof note.text === 'string' && typeof note.time === 'string'
    && typeof note.x === 'number' && Number.isFinite(note.x) && note.x >= 0
    && typeof note.y === 'number' && Number.isFinite(note.y) && note.y >= 0
    && typeof note.rotation === 'number' && Number.isFinite(note.rotation)
    && (note.paperSeed === undefined || isPaperSeed(note.paperSeed))
    && typeof note.read === 'boolean' && typeof note.done === 'boolean'
    && (note.parentId === undefined || typeof note.parentId === 'string')
    && (note.notice === undefined || typeof note.notice === 'string')
    && (note.attachment === undefined || (typeof note.attachment === 'object' && note.attachment !== null
      && typeof (note.attachment as Record<string, unknown>).name === 'string'
      && typeof (note.attachment as Record<string, unknown>).caption === 'string'
      && ['image', 'document'].includes(String((note.attachment as Record<string, unknown>).kind))));
}

export function loadNotes(): StickyNoteData[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as StoredBoard | null;
    if (parsed?.version === 1 && Array.isArray(parsed.notes) && parsed.notes.every(isNote)) {
      const ids = new Set(parsed.notes.map(note => note.id));
      if (ids.size === parsed.notes.length && parsed.notes.every(note => !note.parentId
        || parsed.notes.some(parent => parent.id === note.parentId && !parent.parentId && parent.boardId === note.boardId))) {
        return parsed.notes.map(note => ({ ...note, paperSeed: note.paperSeed ?? paperSeedFromId(note.id) }));
      }
    }
  } catch { /* Повреждённые или недоступные данные не мешают открыть доску. */ }
  return [];
}

export function saveNotes(notes: StickyNoteData[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, notes } satisfies StoredBoard));
    return true;
  } catch { return false; }
}
