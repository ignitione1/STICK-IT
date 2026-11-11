import { useEffect, useRef, useState } from 'react';
import type { StickyNoteData } from './types';

export function useNotificationSound(notes: StickyNoteData[], ready: boolean, employeeId: string, pushEnabled = false) {
  const key = 'stickerboard:notification-sound:' + employeeId;
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(key) !== '0'; } catch { return true; }
  });
  const context = useRef<AudioContext | null>(null);
  const buffer = useRef<Promise<AudioBuffer> | null>(null);
  const active = useRef(enabled);
  active.current = enabled;
  const seen = useRef<Set<string> | null>(null);
  const lastPushSound = useRef(0);

  async function playMessageSound(audio: AudioContext) {
    try {
      buffer.current ??= fetch('/assets/sounds/icq-uh-oh.mp3').then(response => {
        if (!response.ok) throw new Error('Sound unavailable');
        return response.arrayBuffer();
      }).then(bytes => audio.decodeAudioData(bytes));
      const decoded = await buffer.current;
      if (!active.current || audio.state !== 'running') return;
      const source = audio.createBufferSource();
      const volume = audio.createGain();
      volume.gain.value = 0.42;
      source.buffer = decoded;
      source.connect(volume).connect(audio.destination);
      source.onended = () => { source.disconnect(); volume.disconnect(); };
      source.start();
    } catch { buffer.current = null; /* Retry on the next notification; audio is optional. */ }
  }

  function unlock() {
    try {
      context.current ??= new AudioContext();
      if (context.current.state === 'suspended') void context.current.resume().catch(() => {});
    } catch { /* Audio support is optional; notifications still work without it. */ }
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.getRegistration('/').then(registration => registration?.active?.postMessage({
      type: 'stickit-sound-preference', employeeId, enabled,
    })).catch(() => {});
  }, [employeeId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Browsers require a user gesture again after a reload to allow audio.
    const activate = () => unlock();
    window.addEventListener('pointerdown', activate);
    window.addEventListener('keydown', activate);
    return () => {
      window.removeEventListener('pointerdown', activate);
      window.removeEventListener('keydown', activate);
    };
  }, [enabled]);

  useEffect(() => () => {
    if (context.current) void context.current.close().catch(() => {});
    context.current = null;
    buffer.current = null;
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!seen.current) { seen.current = new Set(notes.map(note => note.id)); return; }
    const incoming = notes.some(note => !seen.current!.has(note.id)
      && !note.isArchived && note.isRecipient && !note.read && note.authorId !== employeeId);
    for (const note of notes) seen.current.add(note.id);
    // One sound for a batch, never for edits, restored notes or a read flag being cleared.
    if (incoming && enabled && !pushEnabled && context.current) void playMessageSound(context.current);
  }, [notes, ready, employeeId, enabled, pushEnabled]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem(key, next ? '1' : '0'); } catch { /* Keep the in-memory preference. */ }
    if (next) {
      unlock();
      const audio = context.current;
      if (audio) void audio.resume().then(() => playMessageSound(audio)).catch(() => {});
    }
  }
  function play() {
    if (!active.current || !context.current || Date.now() - lastPushSound.current < 1000) return;
    lastPushSound.current = Date.now();
    void playMessageSound(context.current);
  }
  return { enabled, toggle, play, isEnabled: () => active.current, isReady: () => active.current && context.current?.state === 'running' };
}
