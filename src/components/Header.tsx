import { Plus, Search } from 'lucide-react';
import { useDirectory } from '../directory';
import type { DepartmentId, ViewId } from '../types';
import { MobileMenuButton } from './Sidebar';

interface Props {
  view: ViewId; count: number; query: string; department: DepartmentId | 'all';
  onQuery: (value: string) => void; onDepartment: (value: DepartmentId | 'all') => void;
  onNew: () => void; onMenu: () => void;
}

export default function Header({ view, count, query, department, onQuery, onDepartment, onNew, onMenu }: Props) {
  const { departments } = useDirectory();
  const board = departments.find(item => item.boardId === view);
  const title = board?.name ?? (view === 'mine' ? 'Мои записки' : view === 'archive' ? 'Архив' : 'Уведомления');
  const ending = count % 10 === 1 && count % 100 !== 11 ? 'записка' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'записки' : 'записок';
  return <header className="header">
    <MobileMenuButton onClick={onMenu} />
    <div className="board-heading"><span className="department-dot" style={{ background: board?.color ?? '#657a96' }} /><div><div className="heading-line"><h1>{title}</h1><span className="note-count">{count} {ending}</span></div><p>{view === 'archive' ? 'Сохранённая переписка по отделам' : view === 'notifications' ? 'Непрочитанные обращения на вашей доске' : 'Доска обращений и записок'}</p></div></div>
    <div className="header-tools">
      <label className="search-field"><Search size={17} /><input aria-label="Поиск по запискам" placeholder="Поиск по запискам..." value={query} onChange={event => onQuery(event.target.value)} /></label>
      {view !== 'archive' && <select aria-label="Отдел автора" value={department} onChange={event => onDepartment(event.target.value as DepartmentId | 'all')}><option value="all">Все отделы</option>{departments.filter(item => !item.isGeneral).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
    </div>
    {view !== 'archive' && <button className="primary-button new-note-button" onClick={onNew}><Plus size={17} /><span>Новый стикер</span></button>}
  </header>;
}
