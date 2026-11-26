import { useState } from 'react';
import { Pin, ArrowRight, LockKeyhole } from 'lucide-react';
import { api } from '../api';
import type { Account } from '../api';
import PasswordField from './PasswordField';

export default function Login({ onLogin }: { onLogin: (value: { employee: Account; csrfToken: string }) => Promise<void> }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className="account-entry"><div className="login-art" aria-hidden="true"><div className="login-paper"><Pin size={30} /><span>Хорошие идеи<br />остаются на доске.</span><small>STICK-IT · ДЛЯ КОМАНДЫ</small></div></div>
    <section className="login-card"><div className="account-wordmark"><Pin size={23} /> Stick-it</div><span className="account-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>С возвращением</h1><p>Войдите, чтобы быть на одной доске с командой.</p>
      <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try {
        const session = await api<{ employee: Account; csrfToken: string }>('/auth/login', 'POST', { login, password });
        setPassword(''); await onLogin(session);
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось связаться с сервером'); } finally { setBusy(false); } }}>
        <label className="form-field">Логин<input autoFocus autoComplete="username" value={login} onChange={event => setLogin(event.target.value)} required maxLength={128} /></label>
        <PasswordField label="Пароль" autoComplete="current-password" value={password} onChange={setPassword} required />
        {error && <p className="account-error" role="alert">{error}</p>}
        <button className="primary-button account-submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}<ArrowRight size={17} /></button>
      </form><div className="login-hint"><LockKeyhole size={17} /><p>Учётную запись создаёт администратор.<br />За доступом и сменой пароля обратитесь к нему.</p></div>
    </section></main>;
}
