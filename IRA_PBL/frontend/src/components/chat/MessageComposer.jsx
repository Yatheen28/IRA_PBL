import { useEffect, useRef, useState } from 'react';
import ChatDialog from './ChatDialog';
import ChatIcon, { IconButton } from './ChatIcon';
import { messagePreview } from './chatUtils';

const EMOJIS = [
  ['😀', 'Grinning face'], ['😂', 'Tears of joy'], ['🥹', 'Holding back tears'], ['😊', 'Smiling face'],
  ['😍', 'Heart eyes'], ['🥳', 'Celebrating'], ['😎', 'Sunglasses'], ['🤔', 'Thinking'],
  ['😭', 'Crying'], ['😮', 'Surprised'], ['🙌', 'Raised hands'], ['👏', 'Clapping'],
  ['👍', 'Thumbs up'], ['🙏', 'Folded hands'], ['❤️', 'Heart'], ['🔥', 'Fire'],
  ['✨', 'Sparkles'], ['🎉', 'Party popper'], ['💯', 'Hundred'], ['✅', 'Check mark'],
  ['👀', 'Eyes'], ['☕', 'Coffee'], ['🌻', 'Sunflower'], ['🤝', 'Handshake'],
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export default function MessageComposer({ draft, onDraft, onSend, onTyping, reply, onCancelReply, replyName, disabled = false }) {
  const [picker, setPicker] = useState(null);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const gallery = useRef(null);
  const camera = useRef(null);
  const selection = useRef(0);
  const typingTimer = useRef(null);

  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  useEffect(() => () => { clearTimeout(typingTimer.current); onTyping(false); }, [onTyping]);
  useEffect(() => { if (reply) input.current?.focus(); }, [reply]);

  function change(text) {
    onDraft(text);
    clearTimeout(typingTimer.current);
    onTyping(!!text.trim());
    typingTimer.current = setTimeout(() => onTyping(false), 2200);
  }
  function attach(file) {
    setPicker(null);
    setError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a JPG, PNG, WebP, or GIF image.'); return;
    }
    if (file.size > MAX_IMAGE_SIZE) { setError('This image is too large. Choose one under 10 MB.'); return; }
    setImage(file);
    input.current?.focus();
  }
  async function send(event) {
    event?.preventDefault();
    if (pending || disabled || (!draft.trim() && !image)) return;
    setPending(true);
    setError('');
    onTyping(false);
    clearTimeout(typingTimer.current);
    try {
      await onSend({ text: draft.trim(), file: image, replyToId: reply?.id });
      onDraft(''); setImage(null); onCancelReply();
    } catch (err) { setError(err.message || 'Your message was not sent. Please try again.'); }
    finally { setPending(false); requestAnimationFrame(() => input.current?.focus()); }
  }
  function addEmoji(emoji) {
    const at = selection.current;
    const next = `${draft.slice(0, at)}${emoji}${draft.slice(at)}`;
    if (next.length > 10000) return;
    change(next);
    setPicker(null);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(at + emoji.length, at + emoji.length); });
  }
  return <div className="chat-composer-area">
    {reply && <div className="chat-reply-preview"><ChatIcon name="reply" size={18} /><div><strong>Replying to {replyName}</strong><p>{messagePreview(reply)}</p></div><IconButton icon="close" label="Cancel reply" onClick={onCancelReply} /></div>}
    {image && <div className="chat-attachment-preview"><img src={preview} alt={`Ready to send: ${image.name}`} /><div><strong>{image.name}</strong><small>{(image.size / 1024 / 1024).toFixed(1)} MB · Ready to send</small></div><IconButton icon="close" label="Remove attachment" onClick={() => setImage(null)} disabled={pending} /></div>}
    {error && <p role="alert" className="chat-composer-error">{error}</p>}
    <form className="chat-composer" onSubmit={send} onPaste={event => {
      const file = [...event.clipboardData.items].find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
      if (file && !pending && !disabled) { event.preventDefault(); attach(file); }
    }}>
      <IconButton icon="smile" label="Choose an emoji" disabled={pending || disabled} aria-haspopup="dialog" onClick={() => { selection.current = input.current?.selectionStart ?? draft.length; setPicker('emoji'); }} />
      <IconButton icon="attach" label="Attach a photo" disabled={pending || disabled} aria-haspopup="dialog" onClick={() => setPicker('attachment')} />
      <textarea ref={input} value={draft} onChange={event => change(event.target.value)} aria-label={image ? 'Add a caption' : 'Type a message'} placeholder={image ? 'Add a caption…' : 'Type a message…'} rows={1} maxLength={10000} disabled={pending || disabled}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
      <button className="chat-send" type="submit" disabled={pending || disabled || (!draft.trim() && !image)} aria-label={pending ? 'Sending message' : 'Send message'} title="Send message"><ChatIcon name={pending ? 'more' : 'send'} /></button>
    </form>
    <div className="chat-composer-hint"><span>Just a conversation. Verification is always your choice.</span><span className="mono">Shift + Enter for a new line</span></div>
    <input ref={gallery} type="file" className="visually-hidden" aria-label="Choose image from gallery" tabIndex={-1} accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => { attach(event.target.files?.[0]); event.target.value = ''; }} />
    <input ref={camera} type="file" className="visually-hidden" aria-label="Take a photo" tabIndex={-1} accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { attach(event.target.files?.[0]); event.target.value = ''; }} />
    {picker === 'emoji' && <ChatDialog title="Pick an emoji" className="chat-emoji-dialog" onClose={() => setPicker(null)}><div className="chat-emoji-grid">{EMOJIS.map(([emoji, name]) => <button type="button" key={name} title={name} aria-label={name} onClick={() => addEmoji(emoji)}>{emoji}</button>)}</div></ChatDialog>}
    {picker === 'attachment' && <ChatDialog title="Share something" className="chat-attachment-dialog" onClose={() => setPicker(null)}><div className="chat-action-list">
      <button type="button" onClick={() => { camera.current?.click(); setPicker(null); }}><ChatIcon name="camera" />Take a photo</button>
      <button type="button" onClick={() => { gallery.current?.click(); setPicker(null); }}><ChatIcon name="image" />Photo from gallery</button>
      <button type="button" disabled><ChatIcon name="file" /><span>Document <small>Coming later</small></span></button>
    </div><p className="chat-dialog-description">JPG, PNG, WebP, or GIF · Up to 10 MB. Photos are sent as normal messages, not automatically analyzed.</p></ChatDialog>}
  </div>;
}
