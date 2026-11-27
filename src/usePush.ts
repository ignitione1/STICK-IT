import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const toKey = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));

async function connectPush(publicKey: string, employeeId: string, soundEnabled: boolean) {
  let registration: ServiceWorkerRegistration;
  try {
    await navigator.serviceWorker.register('/push-worker.js');
    registration = await navigator.serviceWorker.ready;
  } catch { throw new Error('Браузер не смог запустить службу уведомлений. Обновите страницу и повторите попытку.'); }
  registration.active?.postMessage({ type: 'stickit-sound-preference', employeeId, enabled: soundEnabled });
  let existing: PushSubscription | null;
  try {
    existing = await registration.pushManager.getSubscription();
    const key = toKey(publicKey);
    const previousKey = existing?.options?.applicationServerKey;
    if (existing && previousKey && (new Uint8Array(previousKey).length !== key.length || !new Uint8Array(previousKey).every((byte, index) => byte === key[index]))) {
      await existing.unsubscribe();
      existing = null;
    }
    existing ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch { throw new Error('Браузер не смог создать push-подписку. Проверьте подключение к сети и разрешение уведомлений.'); }
  const data = existing.toJSON();
  try { await api('/push/subscription', 'POST', { endpoint: data.endpoint, keys: data.keys }); }
  catch (error) {
    if (error instanceof ApiError && error.status === 400) throw new Error('Сервер не принял push-подписку этого браузера.');
    throw new Error('Не удалось сохранить push-подписку на сервере. Повторите попытку.');
  }
}

const setupError = (error: unknown) => error instanceof Error ? error.message : 'Не удалось подключить уведомления';

export function usePush(employeeId: string, onSound: () => void, isSoundEnabled: () => boolean, isSoundReady: () => boolean) {
  const key = 'stickerboard:push:' + employeeId;
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const delivered = useRef(new Set<string>());
  useEffect(() => {
    if (!supported()) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'stickit-identify') event.ports[0]?.postMessage({ employeeId, canPlay: isSoundReady() });
      if (event.data?.type === 'stickit-push' && typeof event.data.id === 'string' && !delivered.current.has(event.data.id)) {
        delivered.current.add(event.data.id); onSound();
      }
      if (event.data?.type === 'stickit-open') window.dispatchEvent(new Event(event.data.completed ? 'stickit:open-mine' : 'stickit:open-notifications'));
    };
    navigator.serviceWorker.addEventListener('message', handler);
    void (async () => {
      if (Notification.permission !== 'granted' || localStorage.getItem(key) === '0') return;
      const { publicKey } = await api<{ publicKey: string }>('/push/config');
      if (!publicKey) return;
      await connectPush(publicKey, employeeId, isSoundEnabled());
      setEnabled(true);
    })().catch(error => setError(setupError(error)));
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [employeeId]);
  async function toggle() {
    setError('');
    if (!supported()) { setError('Уведомления недоступны в этом браузере или без HTTPS'); return; }
    try {
      if (enabled) {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const existing = await registration?.pushManager.getSubscription();
        if (existing) { await api('/push/subscription', 'DELETE', { endpoint: existing.endpoint }); await existing.unsubscribe(); }
        localStorage.setItem(key, '0'); setEnabled(false); return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setError('Разрешите уведомления в настройках браузера'); return; }
      const { publicKey } = await api<{ publicKey: string }>('/push/config');
      if (!publicKey) { setError('Уведомления пока не настроены на сервере'); return; }
      await connectPush(publicKey, employeeId, isSoundEnabled());
      localStorage.setItem(key, '1'); setEnabled(true);
    } catch (failure) { setError(setupError(failure)); }
  }
  return { enabled, toggle, error };
}
