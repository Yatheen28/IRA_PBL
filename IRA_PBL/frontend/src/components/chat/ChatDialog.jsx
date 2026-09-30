import { useEffect, useId, useRef } from 'react';
import { IconButton } from './ChatIcon';

// Native dialog supplies focus trapping, inert background, Escape, and focus return.
export default function ChatDialog({ title, onClose, children, className = '' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`chat-dialog ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === ref.current) {
      const bounds = ref.current.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    } }}>
    <div className="chat-dialog-heading"><h2 id={titleId}>{title}</h2><IconButton icon="close" label="Close dialog" onClick={onClose} /></div>
    {children}
  </dialog>;
}
