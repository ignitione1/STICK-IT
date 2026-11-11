import { useEffect, useState } from 'react';
import App from './App';
import { api, ApiError, setCsrf } from './api';
import type { Account, Catalog, Directory } from './api';
import { DirectoryContext } from './directory';
import type { DepartmentEntry } from './directory';
import type { Employee } from './types';
import Login from './components/Login';
import Profile from './components/Profile';
import Admin from './components/Admin';

export default function Workspace() {
  const [account, setAccount] = useState<Account | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [screen, setScreen] = useState<'board' | 'profile' | 'admin'>('board');
  async function refresh() {
    const [data, choices] = await Promise.all([api<Directory>('/directory'), api<Catalog>('/profile/catalog')]);
    setDirectory(data); setCatalog(choices);
  }
  async function accept(session: { employee: Account; csrfToken: string }) {
    setCsrf(session.csrfToken); await refresh(); setAccount(session.employee); setScreen('board');
  }
  useEffect(() => {
    const ended = () => { setAccount(null); setDirectory(null); setCsrf(''); };
    window.addEventListener('stickerboard:session-ended', ended);
    api<{ employee: Account; csrfToken: string }>('/auth/me').then(accept).catch(error => {
      if (!(error instanceof ApiError && error.status === 401)) setFailure('Не удалось подключиться к серверу. Запустите backend и проверьте подключение к базе.');
    }).finally(() => setLoading(false));
    return () => window.removeEventListener('stickerboard:session-ended', ended);
  }, []);
  useEffect(() => {
    if (!account) return;
    let mounted = true;
    const recheck = async () => {
      try {
        const session = await api<{ employee: Account; csrfToken: string }>('/auth/me');
        if (!mounted) return;
        setCsrf(session.csrfToken); setAccount(session.employee);
        if (session.employee.role !== 'admin') setScreen(previous => previous === 'admin' ? 'board' : previous);
      } catch { /* A 401 clears the session in the API client; transient network errors leave local work intact. */ }
    };
    const timer = window.setInterval(() => { void recheck(); }, 60000);
    const focus = () => { void recheck(); };
    window.addEventListener('focus', focus);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [account?.id]);
  if (loading) return <main className="account-loading" role="status">Открываем Stick-it…</main>;
  if (failure) return <main className="account-loading"><p role="alert">{failure}</p><button className="primary-button" onClick={() => location.reload()}>Повторить</button></main>;
  if (!account || !directory || !catalog) return <Login onLogin={accept} />;
  const allDepartments: DepartmentEntry[] = directory.boards.map(board => {
    const department = directory.departments.find(item => item.id === board.departmentId);
    return { id: department?.id ?? board.id, boardId: board.id, name: board.name,
      code: department?.code.toUpperCase() ?? 'ALL', color: department?.color ?? '#aeb3be',
      stamp: department?.name.toUpperCase() ?? 'ОБЩАЯ ДОСКА', isGeneral: board.isGeneral };
  });
  const departments = allDepartments.filter(entry => entry.isGeneral || directory.departments.some(department => department.id === entry.id && department.isActive));
  const people: Record<string, Employee> = {};
  for (const person of [...directory.employees.filter(person => person.id !== account.id), account]) {
    const memberships = person.id === account.id ? account.departments : directory.memberships.filter(member => member.employeeId === person.id);
    const departmentId = memberships.find(member => member.isPrimary)?.departmentId ?? memberships[0]?.departmentId;
    const department = directory.departments.find(item => item.id === departmentId);
    people[person.id] = { id: person.id, name: person.displayName, label: `${person.displayName}${department ? ` (${department.name})` : ''}`,
      department: departmentId ?? departments.find(item => item.isGeneral)?.id ?? '',
      avatar: person.avatarUrl ?? '', preset: person.paperStyle, isActive: person.isActive };
  }
  const currentEmployee = people[account.id];
  return <DirectoryContext.Provider value={{ departments, allDepartments, employees: people, currentEmployee, isAdmin: account.role === 'admin',
    onProfile: () => setScreen('profile'), onAdmin: () => setScreen('admin'), onLogout: () => {
      void api('/auth/logout', 'POST').then(() => { setAccount(null); setDirectory(null); setCsrf(''); }).catch(error => setFailure(error.message));
    } }}>
    <div hidden={screen !== 'board'}><App /></div>
    {screen === 'profile' && <Profile account={account} catalog={catalog} onClose={() => setScreen('board')} onSaved={async person => { setAccount(person); await refresh(); }} />}
    {screen === 'admin' && account.role === 'admin' && <Admin onClose={() => setScreen('board')} onChanged={async () => {
      await refresh(); const session = await api<{ employee: Account; csrfToken: string }>('/auth/me'); setCsrf(session.csrfToken); setAccount(session.employee);
    }} />}
  </DirectoryContext.Provider>;
}
