import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Users, Building2, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Account, Membership, ServerDepartment } from '../api';
import Modal from './Modal';
import PasswordField from './PasswordField';

type ManagedAccount = Omit<Account, 'departments'>;
type People = { employees: ManagedAccount[]; memberships: (Membership & { employeeId: string })[] };
function PersonForm({ person, departments, memberships, onSubmit }: { person?: ManagedAccount;
  departments: ServerDepartment[]; memberships: Membership[]; onSubmit: (body: unknown) => Promise<void> }) {
  const [name, setName] = useState(person?.displayName ?? '');
  const [login, setLogin] = useState(person?.login ?? '');
  const [password, setPassword] = useState('');
  const role = person?.role ?? 'user';
  const [active, setActive] = useState(person?.isActive ?? true);
  const [ids, setIds] = useState(memberships.map(member => member.departmentId).filter(id => departments.some(department => department.id === id)));
  const [primary, setPrimary] = useState(memberships.find(member => member.isPrimary)?.departmentId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form className="admin-form" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try {
    await onSubmit({ displayName: name, login, role, departmentIds: ids, primaryDepartmentId: primary,
      ...(person ? { isActive: active, ...(password ? { password } : {}) } : { password }) });
  } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить'); } finally { setBusy(false); } }}>
    <label className="form-field">Имя сотрудника<input value={name} onChange={event => setName(event.target.value)} required maxLength={200} /></label>
    <label className="form-field">Логин<input value={login} onChange={event => setLogin(event.target.value)} required minLength={3} maxLength={64} autoComplete="off" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*" /></label>
    <PasswordField label={person ? 'Новый пароль (оставьте пустым, чтобы сохранить)' : 'Пароль'} autoComplete="new-password" value={password} onChange={setPassword} required={!person} minLength={6} />
    <p className="admin-role-label">{role === 'admin' ? 'Администратор · создан отдельной командой' : 'Сотрудник'}</p>
    <fieldset className="department-checks"><legend>Отделы сотрудника</legend>{departments.map(department => <label key={department.id}><input type="checkbox" checked={ids.includes(department.id)} onChange={event => {
      const next = event.target.checked ? [...ids, department.id] : ids.filter(id => id !== department.id); setIds(next);
      if (!next.includes(primary)) setPrimary(next[0] ?? '');
    }} />{department.name}</label>)}</fieldset>
    <label className="form-field">Основной отдел<select required value={primary} onChange={event => setPrimary(event.target.value)}><option value="" disabled>Выберите отдел</option>{departments.filter(department => ids.includes(department.id)).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
    {person && <label className="account-checkbox"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Учётная запись активна</label>}
    {error && <p role="alert" className="account-error">{error}</p>}<button className="primary-button account-submit" disabled={busy || !ids.length}>{busy ? 'Сохраняем…' : person ? 'Сохранить сотрудника' : 'Создать сотрудника'}</button>
  </form>;
}
function DepartmentForm({ department, onSubmit }: { department?: ServerDepartment; onSubmit: (body: unknown) => Promise<void> }) {
  const [name, setName] = useState(department?.name ?? '');
  const [code, setCode] = useState(department?.code ?? '');
  const [color, setColor] = useState(department?.color ?? '#2760db');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form className="admin-form" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onSubmit({ name, code, color }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить'); } finally { setBusy(false); } }}>
    <label className="form-field">Название отдела<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
    <label className="form-field">Код отдела<input required pattern="[a-z][a-z0-9_-]*" maxLength={64} value={code} onChange={event => setCode(event.target.value.toLowerCase())} placeholder="Например, it или accounting" /></label>
    <label className="form-field">Цвет маркировки<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
    {error && <p role="alert" className="account-error">{error}</p>}<button className="primary-button account-submit" disabled={busy}>{busy ? 'Сохраняем…' : department ? 'Сохранить отдел' : 'Создать отдел'}</button>
  </form>;
}

export default function Admin({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const [tab, setTab] = useState<'employees' | 'departments'>('employees');
  const [people, setPeople] = useState<People>({ employees: [], memberships: [] });
  const [departments, setDepartments] = useState<ServerDepartment[]>([]);
  const [editPerson, setEditPerson] = useState<string | null>(null);
  const [editDepartment, setEditDepartment] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  async function reload() {
    const [staff, divisions] = await Promise.all([api<People>('/admin/employees'), api<ServerDepartment[]>('/admin/departments')]);
    setPeople(staff); setDepartments(divisions); setLoaded(true);
  }
  useEffect(() => { void reload().catch(error => setError(error.message)); }, []);
  const activeDepartments = departments.filter(department => department.isActive);
  const visiblePeople = people.employees.filter(person => person.displayName.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')) &&
    (!departmentFilter || people.memberships.some(member => member.employeeId === person.id && member.departmentId === departmentFilter)));
  async function saved() { await reload(); await onChanged(); }
  return <main className="account-page"><div className="account-page-inner">
    <button className="account-back" onClick={onClose}><ArrowLeft size={17} />К доске</button>
    <header className="account-page-header"><div><span className="account-eyebrow">УПРАВЛЕНИЕ ПРОСТРАНСТВОМ</span><h1>Команда и отделы</h1><p>Вы создаёте доступ. Коллеги наполняют доску.</p></div><span className="admin-badge">Администратор</span></header>
    <nav className="admin-tabs" aria-label="Управление"><button aria-pressed={tab === 'employees'} onClick={() => setTab('employees')}><Users size={17} />Сотрудники <span>{people.employees.length}</span></button><button aria-pressed={tab === 'departments'} onClick={() => setTab('departments')}><Building2 size={17} />Отделы <span>{activeDepartments.length}</span></button></nav>
    {error && <p role="alert" className="account-error">{error}</p>}
    {!loaded ? <p role="status">Загружаем команду…</p> : tab === 'employees' ? <section className="account-section"><div className="admin-section-heading"><div><h2>Сотрудники</h2><p>Имена, доступ и принадлежность к отделам.</p></div><button className="primary-button" disabled={!activeDepartments.length} onClick={() => setEditPerson('new')}><Plus size={16} />Добавить сотрудника</button></div>
      {!activeDepartments.length && <p className="admin-empty">Сначала создайте отдел во вкладке «Отделы».</p>}
      <div className="admin-filters"><label className="form-field">Поиск сотрудника<input type="search" list="employee-names" placeholder="Введите имя" value={search} onChange={event => setSearch(event.target.value)} /></label><datalist id="employee-names">{people.employees.filter(person => !departmentFilter || people.memberships.some(member => member.employeeId === person.id && member.departmentId === departmentFilter)).map(person => <option key={person.id} value={person.displayName} />)}</datalist><label className="form-field">Отдел<select aria-label="Отдел" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}><option value="">Все отделы</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}{department.isActive ? '' : ' (неактивный)'}</option>)}</select></label></div>
      <div className="admin-list">{visiblePeople.map(person => {
        const memberships = people.memberships.filter(member => member.employeeId === person.id);
        const primaryDepartment = departments.find(department => department.id === memberships.find(member => member.isPrimary)?.departmentId);
        return <div className="admin-person" key={person.id} style={{ borderLeftColor: primaryDepartment?.color ?? '#d7d9dc' }}><span className="admin-person-icon">{person.displayName[0]}</span><div><strong>{person.displayName}</strong><small>@{person.login} · {person.role === 'admin' ? 'Администратор' : 'Сотрудник'}</small><span>{memberships.map(member => departments.find(department => department.id === member.departmentId)?.name).filter(Boolean).join(', ') || 'Отдел пока не назначен'}</span></div><span className={`account-status ${person.isActive ? '' : 'inactive'}`}>{person.isActive ? 'Активен' : 'Заблокирован'}</span><button className="icon-button" onClick={() => setEditPerson(person.id)} aria-label={`Изменить сотрудника ${person.displayName}`}><Pencil size={17} /></button></div>;
      })}{!visiblePeople.length && <p className="admin-empty">Сотрудники не найдены</p>}</div>
    </section> : <section className="account-section"><div className="admin-section-heading"><div><h2>Отделы</h2><p>При создании отдела его доска появляется автоматически.</p></div><button className="primary-button" onClick={() => setEditDepartment('new')}><Plus size={16} />Добавить отдел</button></div><div className="department-cards">
      {activeDepartments.map(department => <article className="department-card" key={department.id}><span className="department-dot" style={{ background: department.color }} /><h3>{department.name}</h3><small>{department.code.toUpperCase()}</small><div><button className="icon-button" onClick={() => setEditDepartment(department.id)} aria-label={`Изменить отдел ${department.name}`}><Pencil size={17} /></button><button className="icon-button" aria-label={`Удалить отдел ${department.name}`} onClick={async () => {
        if (!window.confirm(`Убрать отдел «${department.name}» из активного списка? История сохранится.`)) return;
        setError(''); try { await api(`/admin/departments/${department.id}`, 'DELETE'); await saved(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось удалить'); }
      }}><Trash2 size={17} /></button></div></article>)}
    </div>{!activeDepartments.length && <p className="admin-empty">Первый отдел — начало вашей команды.</p>}</section>}
    {editPerson && <Modal title={editPerson === 'new' ? 'Новый сотрудник' : 'Редактирование сотрудника'} onClose={() => setEditPerson(null)}><PersonForm person={people.employees.find(person => person.id === editPerson)} departments={activeDepartments} memberships={people.memberships.filter(member => member.employeeId === editPerson)} onSubmit={async body => {
      await api(editPerson === 'new' ? '/admin/employees' : `/admin/employees/${editPerson}`, editPerson === 'new' ? 'POST' : 'PATCH', body); setEditPerson(null); await saved();
    }} /></Modal>}
    {editDepartment && <Modal title={editDepartment === 'new' ? 'Новый отдел' : 'Редактирование отдела'} onClose={() => setEditDepartment(null)}><DepartmentForm department={departments.find(department => department.id === editDepartment)} onSubmit={async body => {
      await api(editDepartment === 'new' ? '/admin/departments' : `/admin/departments/${editDepartment}`, editDepartment === 'new' ? 'POST' : 'PATCH', body); setEditDepartment(null); await saved();
    }} /></Modal>}
  </div></main>;
}
