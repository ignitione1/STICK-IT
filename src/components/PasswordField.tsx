import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordField({ label, value, onChange, autoComplete, required, minLength }: {
  label: string; value: string; onChange: (value: string) => void;
  autoComplete: string; required?: boolean; minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="form-field password-field"><label htmlFor={autoComplete === 'current-password' ? 'login-password' : 'employee-password'}>{label}</label>
    <div className="password-input-wrap"><input id={autoComplete === 'current-password' ? 'login-password' : 'employee-password'} type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} required={required} minLength={minLength} maxLength={128} />
      <button type="button" className="password-toggle" aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
  </div>;
}
