import { useEffect, useRef, useState } from 'react';
import ChatIcon, { IconButton } from './ChatIcon';
import { formatTime, messagePreview } from './chatUtils';

export function useMessageImage(message, loadImage) {
  const [state, setState] = useState({ url: '', error: '' });
  useEffect(() => {
    if (message.kind !== 'image' || message.deleted) return;
    let active = true;
    let url;
    setState({ url: '', error: '' });
    loadImage(message).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setState({ url, error: '' });
    }).catch(err => { if (active) setState({ url: '', error: err.message || 'Photo could not be loaded.' }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [message.id, message.kind, message.deleted, loadImage]);
  return state;
}

export default function ChatMessage({ message, own, senderName, replyName, loadImage, onAction, onImage, onQuote, children }) {
  const { url, error } = useMessageImage(message, loadImage);
  const press = useRef(null);
  useEffect(() => () => clearTimeout(press.current), []);
  const status = message.status || 'sent';
  return <article id={`message-${message.id}`} className={`chat-message-row ${own ? 'is-own' : ''}`} aria-label={`${own ? 'You' : senderName}, ${formatTime(message.createdAt)}`}>
    <div className="chat-message-stack">
      <div className={`chat-message-bubble ${message.kind === 'image' ? 'has-photo' : ''} ${message.deleted ? 'is-deleted' : ''}`}
        onContextMenu={event => { if (!message.deleted) { event.preventDefault(); onAction(message); } }}
        onPointerDown={event => { if (event.pointerType === 'touch' && !message.deleted) press.current = setTimeout(() => onAction(message), 550); }}
        onPointerMove={() => clearTimeout(press.current)} onPointerUp={() => clearTimeout(press.current)} onPointerCancel={() => clearTimeout(press.current)}>
        {!own && <span className="chat-message-sender">{senderName}</span>}
        {message.forwardedFromId && !message.deleted && <span className="chat-forwarded"><ChatIcon name="forward" size={13} />Forwarded</span>}
        {message.replyTo && !message.deleted && <button type="button" className="chat-quoted" onClick={() => onQuote(message.replyTo.id)}><strong>{replyName}</strong><span>{messagePreview(message.replyTo)}</span></button>}
        {message.deleted ? <p className="chat-message-deleted"><ChatIcon name="trash" size={14} />This message was deleted.</p> : <>
          {message.kind === 'image' && <div className="chat-photo">
            {url ? <button type="button" onClick={() => onImage({ url, message })} aria-label="Open photo"><img src={url} alt={message.text || message.image?.name || 'Photo shared in this conversation'} loading="lazy" /></button> : <div className="chat-photo-placeholder" role="status"><ChatIcon name="image" size={30} /><span>{error || 'Loading photo…'}</span></div>}
          </div>}
          {message.text && <p className="chat-message-text" dir="auto">{message.text}</p>}
        </>}
        <div className="chat-message-meta">
          {!message.deleted && <IconButton icon="more" label="Message actions" className="chat-message-more" onClick={() => onAction(message)} />}
          <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{formatTime(message.createdAt)}</time>
          {own && <span className={`chat-message-status status-${status}`} title={status === 'sent' ? 'Sent to server' : status === 'read' ? 'Read' : 'Delivered'} aria-label={status === 'sent' ? 'Sent to server' : status === 'read' ? 'Read' : 'Delivered'}><ChatIcon name={status === 'sent' ? 'check' : 'checks'} size={16} /></span>}
        </div>
      </div>
      {!message.deleted && children}
    </div>
  </article>;
}
