import type { StickyNoteData } from './types';

export interface ArchiveEntry {
  note: StickyNoteData;
  replies: StickyNoteData[];
  original?: StickyNoteData;
}

/** An archived root groups matching replies; an active root is only shown as context. */
export function archiveEntries(matches: StickyNoteData[], allNotes: StickyNoteData[]): ArchiveEntry[] {
  const byId = new Map(allNotes.map(note => [note.id, note]));
  const entries = new Map<string, ArchiveEntry>();
  for (const note of matches) {
    if (!note.isArchived) continue;
    const root = note.parentId ? byId.get(note.parentId) : undefined;
    if (root?.isArchived) {
      const entry = entries.get(root.id) ?? { note: root, replies: [] };
      entry.replies.push(note);
      entries.set(root.id, entry);
    } else if (!entries.has(note.id)) {
      entries.set(note.id, { note, replies: [], original: root });
    }
  }
  return [...entries.values()].map(entry => ({ ...entry,
    replies: entry.replies.sort((a, b) => (a.replyOrder ?? 0) - (b.replyOrder ?? 0)),
  })).sort((a, b) => (b.note.effectiveArchivedAt ?? b.note.archivedAt ?? '').localeCompare(a.note.effectiveArchivedAt ?? a.note.archivedAt ?? '') || a.note.id.localeCompare(b.note.id));
}
