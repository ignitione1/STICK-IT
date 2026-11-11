import { useRef, useState } from 'react';
import { Pin, Image, Paperclip, X } from 'lucide-react';
import { useDirectory } from '../directory';
import type { DepartmentId, StickyNoteData } from '../types';
import Avatar from './Avatar';
import Modal from './Modal';
import type { NoteDraft } from '../useNotes';

async function contentHash(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export default function NoteComposer({ boardId, parent, editing, onClose, onSubmit }: {
  boardId: DepartmentId; parent?: StickyNoteData; editing?: StickyNoteData; onClose: () => void;
  onSubmit: (draft: NoteDraft) => Promise<void>;
}) {
  const { currentEmployee, departments, employees } = useDirectory();
  const [text, setText] = useState(editing?.text ?? '');
  const [destination, setDestination] = useState(boardId);
  const [id] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState(parent ? 'employees' : 'board');
  const [recipients, setRecipients] = useState<string[]>(parent ? [parent.authorId] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<{ file: File; contentHash: string }[]>([]);
  const [retained, setRetained] = useState(editing?.attachments ?? (editing?.attachment ? [editing.attachment] : []));
  const [checking, setChecking] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  async function addFiles(selected: FileList | null) {
    if (!selected) return;
    const chosen = Array.from(selected);
    if (chosen.some(file => file.size > 10 * 1024 * 1024)) { setError('До 10 МБ на файл'); return; }
    setChecking(true); setError('');
    try {
      const known = [...retained];
      // Older uploads get their hash lazily, only while choosing files in the editor.
      for (const [index, item] of known.entries()) {
        if (!item.contentHash && item.id && item.available !== false && chosen.some(file => file.size === item.sizeBytes)) {
          const response = await fetch('/api/attachments/' + item.id + '/download', { credentials: 'same-origin', cache: 'no-store' });
          if (!response.ok) throw new Error('Не удалось проверить прежние вложения. Повторите выбор файла.');
          known[index] = { ...item, contentHash: await contentHash(await response.arrayBuffer()) };
        }
      }
      const hashes = new Set([...known.map(file => file.contentHash), ...files.map(file => file.contentHash)].filter(Boolean));
      const next = [...files];
      let duplicate = false;
      for (const file of chosen) {
        const hash = await contentHash(await file.arrayBuffer());
        if (hashes.has(hash)) { duplicate = true; continue; }
        hashes.add(hash); next.push({ file, contentHash: hash });
      }
      if (known.length + next.length > 5 || next.reduce((sum, item) => sum + item.file.size, 0) + known.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0) > 25 * 1024 * 1024) {
        setError('До 5 файлов: не более 10 МБ каждый и 25 МБ суммарно'); return;
      }
      setRetained(known); setFiles(next);
      if (duplicate) setError('Повторные файлы не добавлены: они уже есть во вложениях');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось проверить файлы'); }
    finally { setChecking(false); }
  }
  const board = departments.find(department => department.boardId === destination);
  return <Modal title={editing ? 'Редактировать записку' : parent ? 'Ответить стикером' : 'Новый стикер'} onClose={onClose}>
    <form onSubmit={async event => {
      event.preventDefault(); if (!text.trim()) return;
      setBusy(true); setError('');
      try { await onSubmit({ id: editing?.id ?? id, text: text.trim(), boardId: destination,
        files: files.map(item => item.file),
        ...(editing ? { keepAttachmentIds: retained.flatMap(file => file.id ? [file.id] : []) } : {}),
        ...(mode === 'employees' ? { recipientEmployeeIds: recipients } : {}),
        ...(mode === 'departments' ? { recipientDepartmentIds: recipients } : {}) }); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить записку'); }
      finally { setBusy(false); }
    }}>
      <div className="composer-author"><Avatar employee={currentEmployee} /><div><strong>{currentEmployee.name}</strong><span>{departments.find(item => item.id === currentEmployee.department)?.name ?? 'Сотрудник'}</span></div></div>
      {parent ? <blockquote><span>В ответ на записку · {parent.authorSnapshot?.name ?? employees[parent.authorId]?.name ?? 'Сотрудник'}</span>{parent.text}</blockquote>
        : !editing && <label className="form-field">Доска<select aria-label="Доска" value={destination} onChange={event => setDestination(event.target.value as DepartmentId)}>{departments.map(department => <option key={department.id} value={department.boardId}>{department.name}</option>)}</select></label>}
      {!editing && <><label className="form-field">Получатель<select aria-label="Получатель" value={mode} onChange={event => { setMode(event.target.value); setRecipients([]); }}>
        <option value="board">{board?.isGeneral ? 'Всем сотрудникам' : 'Всему отделу этой доски'}</option><option value="employees">Выбрать сотрудников</option><option value="departments">Выбрать отделы</option>
      </select></label>{mode !== 'board' && <fieldset className="department-checks recipient-checks"><legend>{mode === 'employees' ? 'Сотрудники-получатели' : 'Отделы-получатели'}</legend>
        {(mode === 'employees' ? Object.values(employees).filter(employee => employee.isActive !== false).map(employee => ({ id: employee.id, name: employee.name })) : departments.filter(department => !department.isGeneral)).map(person => <label key={person.id}><input type="checkbox" checked={recipients.includes(person.id)} onChange={event => setRecipients(previous => event.target.checked ? [...previous, person.id] : previous.filter(id => id !== person.id))} />{person.name}</label>)}
      </fieldset>}</>}
      <label className="form-field">{parent ? 'Ваш ответ' : 'Текст записки'}<textarea autoFocus value={text} onChange={event => setText(event.target.value)} placeholder="Что хотите передать коллегам?" required maxLength={2000} rows={6} /></label>
      <div className="composer-attachments">
        <div className="attachment-picker-buttons"><button type="button" className="secondary-button" disabled={busy || checking} onClick={() => imageInput.current?.click()}><Image size={16} />Изображение</button><button type="button" className="secondary-button" disabled={busy || checking} onClick={() => fileInput.current?.click()}><Paperclip size={16} />Файл</button></div>
        <input ref={imageInput} type="file" hidden multiple disabled={busy || checking} accept=".jpg,.jpeg,.png,.gif,.webp" aria-label="Прикрепить изображения" onChange={event => { void addFiles(event.target.files); event.target.value = ''; }} />
        <input ref={fileInput} type="file" hidden multiple disabled={busy || checking} accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.md,.csv,.tsv,.rtf,.odt,.ods,.odp,.json,.xml,.log,.zip,.7z,.rar" aria-label="Прикрепить файлы" onChange={event => { void addFiles(event.target.files); event.target.value = ''; }} />
        {!!(retained.length + files.length) && <ul className="selected-attachments">
          {retained.map((file, index) => <li key={file.id ?? 'old-' + index}><span>{file.name}<small>{file.caption}</small></span><button type="button" className="icon-button" disabled={busy || checking} aria-label={'Убрать вложение ' + file.name} onClick={() => setRetained(previous => previous.filter((_, item) => item !== index))}><X size={16} /></button></li>)}
          {files.map(({ file }, index) => <li key={'new-' + index}><span>{file.name}<small>{file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(file.size / 1024)} КБ`}</small></span><button type="button" className="icon-button" disabled={busy || checking} aria-label={'Убрать вложение ' + file.name} onClick={() => setFiles(previous => previous.filter((_, item) => item !== index))}><X size={16} /></button></li>)}
        </ul>}
        {checking && <p role="status">Проверяем файлы…</p>}
        <small>До 5 файлов · по 10 МБ · всего до 25 МБ</small>
      </div>
      {error && <p role="alert" className="account-error">{error}</p>}
      <div className="composer-bottom"><span>{text.length} / 2000</span><button type="submit" className="primary-button" disabled={busy || checking || !text.trim() || (!editing && mode !== 'board' && !recipients.length)}><Pin size={16} />{busy ? 'Сохраняем…' : editing ? 'Сохранить' : 'Закрепить'}</button></div>
    </form>
  </Modal>;
}
