import { useEffect, useState } from 'react';
import type { Employee } from '../types';
import { resolveAvatar } from '../avatar';

export default function Avatar({ employee }: { employee: Employee }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [employee.avatar]);
  return <span className={`avatar avatar-${employee.department}`}>
    {failed || !employee.avatar ? <span aria-label={employee.name}>{employee.name.slice(0, 1)}</span>
      : <img src={resolveAvatar(employee.avatar) ?? undefined} alt={employee.name} draggable={false} onError={() => setFailed(true)} />}
  </span>;
}
