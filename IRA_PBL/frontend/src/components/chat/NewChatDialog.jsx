import { useEffect, useState } from 'react';
import { LocalChatService } from '../../api/chat';
import ChatDialog from './ChatDialog';
import ChatIcon, { Avatar } from './ChatIcon';

export default function NewChatDialog({ currentUser, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setUsers([]);
    setError('');
    if (!query.trim()) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      const svc = new LocalChatService();
      svc.user = currentUser;
      svc.listUsers(query.trim()).then(data => { if (!cancelled) setUsers(data); })
        .catch(err => { if (!cancelled) setError(err.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, currentUser.id]);
  async function open(user) {
    setOpening(user.id);
    setError('');
    try { await onSelect(user.id); } catch (err) { setError(err.message); setOpening(null); }
  }
  return <ChatDialog title="Start a conversation" onClose={onClose}>
    <p className="chat-dialog-description">Find someone by their name or username.</p>
    <label className="chat-search"><ChatIcon name="search" size={18} /><input autoFocus aria-label="Search people" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people…" maxLength={80} /></label>
    <div className="chat-people-list" aria-live="polite">
      {loading && <p className="chat-list-note">Searching people…</p>}
      {error && <p className="chat-form-error" role="alert">{error}</p>}
      {!loading && !error && !users.length && <p className="chat-list-note">{query.trim() ? 'No people found. Check their username or invite them to create an account on this server.' : 'Conversations start with real people. Ask a friend for their VAJRA username.'}</p>}
      {users.map(user => <button key={user.id} type="button" className="chat-person" onClick={() => open(user)} disabled={!!opening}>
        <Avatar name={user.displayName} /><span><strong>{user.displayName}</strong><small>@{user.username}</small></span><span className="chat-person-action">{opening === user.id ? 'Opening…' : <ChatIcon name="plus" size={18} />}</span>
      </button>)}
    </div>
    <div className="chat-dialog-note"><ChatIcon name="info" size={16} /><p>Your username is <strong>@{currentUser.username}</strong>. Share it so others can find you.</p></div>
  </ChatDialog>;
}
