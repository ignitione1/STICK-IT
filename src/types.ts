export type DepartmentId = string;
export type PresetId = 'yellow' | 'mint' | 'pink' | 'blue' | 'cream' | 'lavender' | 'peach' | 'sea' | 'sage' | 'berry';
export type FasteningId = 'pin' | 'clip' | 'tape' | 'fold';
export type ViewId = DepartmentId | 'mine' | 'notifications';
export type NoteFilter = 'all' | 'todo' | 'replies';

export interface Employee {
  id: string;
  name: string;
  label: string;
  department: DepartmentId;
  avatar: string;
  preset: PresetId;
  isActive?: boolean;
}

export interface StickyNoteData {
  id: string;
  boardId: DepartmentId;
  authorId: string;
  time: string;
  text: string;
  x: number;
  y: number;
  rotation: number;
  /** Assigned once. Optional only for boards saved before paper variation was added. */
  paperSeed?: number;
  preset?: PresetId;
  fastening?: FasteningId;
  authorSnapshot?: Employee;
  departmentSnapshot?: { id: string; name: string; color: string; stamp: string };
  revision?: number;
  zIndex?: number;
  replyOrder?: number | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  effectiveArchivedAt?: string | null;
  isArchived?: boolean;
  isRecipient?: boolean;
  canMark?: boolean;
  canEdit?: boolean;
  canArchive?: boolean;
  canRestore?: boolean;
  recipientEmployeeIds?: string[];
  recipientDepartmentIds?: string[];
  busy?: boolean;
  read: boolean;
  done: boolean;
  parentId?: string;
  attachment?: NoteAttachment;
  attachments?: NoteAttachment[];
  notice?: string;
  announcement?: boolean;
}

export interface StoredBoard {
  version: 1;
  notes: StickyNoteData[];
}

export interface NoteAttachment { id?: string; name: string; caption: string; kind: 'image' | 'document'; sizeBytes?: number; contentHash?: string; available?: boolean }
