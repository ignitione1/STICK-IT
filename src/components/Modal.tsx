import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const startedOnBackdrop = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className={'modal ' + className} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="modal-title"
    onPointerDown={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      startedOnBackdrop.current = event.target === event.currentTarget &&
        (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    }}
    onPointerCancel={() => { startedOnBackdrop.current = false; }}
    onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const endedOnBackdrop = event.target === event.currentTarget &&
        (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
      if (startedOnBackdrop.current && endedOnBackdrop) onClose();
      startedOnBackdrop.current = false;
    }}>
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}
