import type { FasteningId, PresetId } from './types';
export interface Membership { departmentId: string; isPrimary: boolean; employeeId?: string }
export interface Account {
  id: string; login: string; displayName: string; avatarUrl: string | null;
  role: 'user' | 'admin'; isActive: boolean; paperStyle: PresetId; fastening: FasteningId; departments: Membership[];
}
export interface ServerDepartment { id: string; name: string; code: string; color: string; isActive: boolean }
export interface Directory {
  departments: ServerDepartment[];
  boards: { id: string; name: string; departmentId: string | null; isGeneral: boolean }[];
  employees: Pick<Account, 'id' | 'displayName' | 'avatarUrl' | 'paperStyle' | 'isActive'>[];
  memberships: (Membership & { employeeId: string })[];
}
export interface Catalog {
  avatars: { id: string; url: string; name: string; gender: 'male' | 'female' }[];
  styles: { id: PresetId; name: string; description: string }[];
  fastenings: { id: FasteningId; name: string; description: string }[];
}
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
let csrf = '';
export const setCsrf = (value: string) => { csrf = value; };
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'x-stickerboard-request': '1', 'x-csrf-token': csrf }) },
    ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({ error: 'Сервер вернул некорректный ответ' }));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('stickerboard:session-ended'));
    throw new ApiError(response.status, data.error || 'Не удалось выполнить запрос');
  }
  return data as T;
}
