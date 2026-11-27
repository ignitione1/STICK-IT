import type { CSSProperties, ReactNode } from 'react';
import { Clock3, Download, ExternalLink, FileText, Image, Reply, Pencil, Archive, ArchiveRestore } from 'lucide-react';
import { presets } from '../data';
import { useDirectory } from '../directory';
import type { StickyNoteData } from '../types';
import Avatar from './Avatar';
import PaperSurface from './PaperSurface';
import Fastening from './Fastening';
import { getPaperAppearance, paperSeedFromId } from '../paper';

interface Props {
  note: StickyNoteData;
  dragHandle: ReactNode;
  onToggle: (id: string, key: 'read' | 'done') => void;
  onReply: (note: StickyNoteData) => void;
  onAttachment: (note: StickyNoteData) => void;
  onEdit?: (note: StickyNoteData) => void;
  onArchive?: (note: StickyNoteData, archived: boolean) => void;
  readOnly?: boolean;
  standalone?: boolean;
}

function Message({ text }: { text: string }) {
  return <>{text.split(/(\/Shared\/Confidential|m\.ivanov@company\.ru|21:00|22:30)/g).map((part, index) => /^(21:00|22:30)$/.test(part)
    ? <strong key={index}>{part}</strong> : part === '/Shared/Confidential' ? <mark key={index}>{part}</mark>
      : part.includes('@company.ru') ? <a key={index} href={`mailto:${part}`}>{part}</a> : part)}</>;
}

export default function StickyNote({ note, dragHandle, onToggle, onReply, onAttachment, onEdit, onArchive, readOnly, standalone }: Props) {
  const { departments, employees } = useDirectory();
  const employee = note.authorSnapshot ?? employees[note.authorId] ?? { id: note.authorId, name: 'Сотрудник', label: 'Сотрудник', department: '', avatar: '', preset: 'yellow' as const };
  const department = note.departmentSnapshot ?? departments.find(item => item.id === employee.department) ?? { color: '#657a96', stamp: 'СОТРУДНИК' };
  const presetId = note.preset ?? employee.preset;
  const preset = presets[presetId];
  const paper = getPaperAppearance(note.paperSeed ?? paperSeedFromId(note.id));
  const createdAt = note.createdAt ? new Date(note.createdAt) : null;
  const date = createdAt && !Number.isNaN(createdAt.getTime()) ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(createdAt) : '';
  const style = {
    '--department-color': department.color, '--paper-color': preset.color, '--rotation': `${note.rotation}deg`,
    '--sheet-edge': paper.edge, '--wear-corner-size': paper.cornerSize,
    '--texture-position': paper.texturePosition, '--texture-size': paper.textureSize,
  } as CSSProperties;
  return <article className={`sticky-note preset-${presetId} paper-wear-${paper.variant} paper-corner-${paper.cornerSide} ${note.done && !readOnly ? 'note-completed' : ''} ${note.parentId && !standalone ? 'reply-note' : ''}`} style={style} data-note-id={note.id} data-paper-variant={paper.variant} aria-label={`Записка: ${employee.name}`}>
    <PaperSurface preset={presetId} fastening={note.parentId && !standalone ? undefined : note.fastening ?? preset.fastening} />
    {(!note.parentId || standalone) && <Fastening kind={note.fastening ?? preset.fastening} hue={employee.id === 'anna' ? 3 : employee.preset === 'blue' ? 199 : 44} />}
    {dragHandle}
    <div className="note-html">
      <div className="note-author"><Avatar employee={employee} /><div><h2>{employee.label}</h2><time className="note-time" dateTime={date ? note.createdAt : undefined}><Clock3 size={12} />{date && <>{date} · </>}{note.time}</time></div></div>
      <div className="note-message"><Message text={note.text} /></div>
      {(note.attachments ?? (note.attachment ? [note.attachment] : [])).map((file, index) => <button key={file.id ?? index} className={`attachment attachment-${file.kind}`} onClick={() => onAttachment({ ...note, attachment: file })} title={file.kind === 'image' ? 'Открыть изображение' : 'Скачать файл'}>
        {file.kind === 'image' ? <Image size={17} /> : <FileText size={19} />}<span><strong>{file.name}</strong><small>{file.caption}</small></span>{file.kind === 'image' ? <ExternalLink size={17} /> : <Download size={17} />}
      </button>)}
      {note.notice && <div className="note-notice">{note.notice}</div>}
      <div className="stamp-row"><span className="department-stamp">{department.stamp}{note.id.includes('anna-1') ? ' · ОТДЕЛ' : ''}{note.announcement ? ' · ОБЪЯВЛЕНИЕ' : ''}</span></div>
      <footer className="note-actions">
        <label><input type="checkbox" checked={note.read} disabled={readOnly || note.canMark === false || note.busy} data-pending={!!note.busy && !readOnly && note.canMark !== false} onChange={() => onToggle(note.id, 'read')} /><span>Прочитано</span></label>
        <label><input type="checkbox" checked={note.done} disabled={readOnly || note.canMark === false || note.busy || !note.read} data-pending={!!note.busy && !readOnly && note.canMark !== false && note.read} onChange={() => onToggle(note.id, 'done')} /><span>Готово</span></label>
        {!readOnly && <button onClick={() => onReply(note)}><Reply size={13} />Ответить</button>}
      </footer>
      {((!readOnly && (note.canEdit || note.canArchive)) || note.canRestore) && <div className="note-management">
        {!readOnly && note.canEdit && <button disabled={note.busy} onClick={() => onEdit?.(note)}><Pencil size={16} />Изменить</button>}
        {!readOnly && note.canArchive && <button className="note-archive-button" disabled={note.busy} onClick={() => onArchive?.(note, true)}><Archive size={16} />В архив</button>}
        {note.canRestore && <button disabled={note.busy} onClick={() => onArchive?.(note, false)}><ArchiveRestore size={16} />Вернуть на доску</button>}
      </div>}
    </div>
  </article>;
}
