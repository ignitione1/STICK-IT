import { useEffect, useRef, useState } from 'react';
import { api } from './api';

const supported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const toKey = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));

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
      if (event.data?.type === 'stickit-open') window.dispatchEvent(new Event('stickit:open-notifications'));
    };
    navigator.serviceWorker.addEventListener('message', handler);
    void (async () => {
      if (Notification.permission !== 'granted' || localStorage.getItem(key) === '0') return;
      const { publicKey } = await api<{ publicKey: string }>('/push/config');
      if (!publicKey) return;
      const registration = await navigator.serviceWorker.register('/push-worker.js');
      await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'stickit-sound-preference', employeeId, enabled: isSoundEnabled() });
      const existing = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      const data = existing.toJSON();
      await api('/push/subscription', 'POST', { endpoint: data.endpoint, keys: data.keys });
      setEnabled(true);
    })().catch(() => setError('Не удалось подключить уведомления'));
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
      const registration = await navigator.serviceWorker.register('/push-worker.js');
      await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'stickit-sound-preference', employeeId, enabled: isSoundEnabled() });
      const existing = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      const data = existing.toJSON();
      await api('/push/subscription', 'POST', { endpoint: data.endpoint, keys: data.keys });
      localStorage.setItem(key, '1'); setEnabled(true);
    } catch { setError('Не удалось подключить уведомления'); }
  }
  return { enabled, toggle, error };
}
