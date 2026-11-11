import { Bell, BellOff, Menu, StickyNote, X, Settings, Shield, LogOut, Archive, Volume2, VolumeX } from 'lucide-react';
import { useDirectory } from '../directory';
import type { ViewId } from '../types';
import Avatar from './Avatar';

interface Props { view: ViewId; onChange: (view: ViewId) => void; unread: number; soundEnabled: boolean; onToggleSound: () => void; pushEnabled: boolean; onTogglePush: () => void; pushError: string; open: boolean; onClose: () => void }

export default function Sidebar({ view, onChange, unread, soundEnabled, onToggleSound, pushEnabled, onTogglePush, pushError, open, onClose }: Props) {
  const { currentEmployee, departments, isAdmin, onProfile, onAdmin, onLogout } = useDirectory();
  function select(next: ViewId) { onChange(next); onClose(); }
  return <>
    {open && <button className="sidebar-scrim" aria-label="Закрыть меню" onClick={onClose} />}
    <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Навигация">
      <div className="brand">
        <div className="brand-mark" aria-label="Stick-it. Stick it. Share it. Done.">
          <svg className="brand-lettering" viewBox="0 0 180 40" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 7 C15 3 6 6 6 12 C6 18 21 17 22 23 C23 30 13 34 5 29" />
              <path d="M29 7 L50 6 M40 7 L38 32" />
              <path d="M57 7 L55 32" />
              <path d="M82 9 C76 4 68 7 67 19 C66 30 73 34 81 29" />
              <path d="M89 7 L88 32 M105 7 L89 21 L104 32" />
            </g>
            <g fill="none" stroke="#68869a" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(21 0)">
              <path d="M91 21 L103 20" />
              <path d="M113 7 L111 32" />
              <path d="M122 7 L146 6 M135 7 L133 32" />
            </g>
          </svg>
          <span className="brand-tagline" aria-hidden="true">Stick it. Share it. Done.</span>
        </div>
        <button className="icon-button mobile-close" onClick={onClose} aria-label="Закрыть меню"><X size={18} /></button>
      </div>
      <nav className="personal-nav" aria-label="Личные записки">
        <button className={`nav-item ${view === 'archive' ? 'selected' : ''}`} onClick={() => select('archive')} aria-current={view === 'archive' ? 'page' : undefined}><Archive size={18} /><span>Архив</span></button>
        <button className={`nav-item ${view === 'mine' ? 'selected' : ''}`} onClick={() => select('mine')} aria-current={view === 'mine' ? 'page' : undefined}><StickyNote size={18} /><span>Мои записки</span></button>
        <button className={`nav-item ${view === 'notifications' ? 'selected' : ''}`} onClick={() => select('notifications')} aria-current={view === 'notifications' ? 'page' : undefined}><Bell size={18} /><span>Уведомления</span>{unread > 0 && <span className="notification-count">{unread}</span>}</button>
        <button className="nav-item notification-sound" aria-label="Звук уведомлений" aria-pressed={soundEnabled} onClick={onToggleSound} title={soundEnabled ? 'Выключить звук уведомлений' : 'Включить и прослушать звук уведомлений'}>{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Звук {soundEnabled ? 'включён' : 'выключен'}</span></button>
        <button className="nav-item notification-sound" aria-label="Push-уведомления на рабочем столе" aria-pressed={pushEnabled} onClick={onTogglePush}>{pushEnabled ? <Bell size={16} /> : <BellOff size={16} />}<span>Push {pushEnabled ? 'включены' : 'выключены'}</span></button>
        {pushError && <p className="push-error" role="status">{pushError}</p>}
      </nav>
      <nav className="department-nav" aria-label="Доски отделов">
        <h2>ДОСКИ ОТДЕЛОВ</h2>
        {departments.map(department => <button key={department.id} className={`nav-item department-item ${view === department.boardId ? 'selected' : ''}`} onClick={() => select(department.boardId)} aria-current={view === department.boardId ? 'page' : undefined}>
          <span className="department-dot" style={{ background: department.color }} /><span>{department.name}</span><span className="department-code" style={{ color: department.color }}>{department.code}</span>
        </button>)}
      </nav>
      <div className="account-nav"><button className="nav-item" onClick={onProfile}><Settings size={17} />Мой профиль</button>{isAdmin && <button className="nav-item" onClick={onAdmin}><Shield size={17} />Управление командой</button>}<button className="nav-item" onClick={onLogout}><LogOut size={17} />Выйти</button></div>
      <div className="profile"><Avatar employee={currentEmployee} /><div><strong>{currentEmployee.name}</strong><span>{isAdmin ? 'Администратор' : 'Сотрудник'}</span></div></div>
    </aside>
  </>;
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return <button className="icon-button mobile-menu" aria-label="Открыть меню" onClick={onClick}><Menu size={22} /></button>;
}
