import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ChatIcon, { Avatar, IconButton } from './ChatIcon';
import ChatMessage from './ChatMessage';
import MessageComposer from './MessageComposer';
import { conversationName, formatDay } from './chatUtils';

export default function Conversation({ conversation, user, messages, loading, error, hasMore, onLoadOlder, onRetry, onBack, onInfo, onAction, onImage, onSend, onTyping, typing, presence, connection, draft, onDraft, reply, onCancelReply, loadImage, renderVerification, onRead }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [newBelow, setNewBelow] = useState(false);
  const scroll = useRef(null);
  const nearBottom = useRef(true);
  const lastMessage = useRef(null);
  const previousHeight = useRef(null);
  const initialScroll = useRef(true);
  const name = conversationName(conversation, user.id);
  const peer = conversation.participants?.find(person => person.id !== user.id);
  const people = conversation.participants || [];
  const findName = id => id === user.id ? 'You' : people.find(person => person.id === id)?.displayName || 'Participant';
  const typingNames = Object.keys(typing || {}).filter(id => id !== user.id).map(findName);
  const online = connection === 'connected' && !!presence[peer?.id];
  const filtered = search.trim() ? messages.filter(message => !message.deleted && message.text?.toLowerCase().includes(search.toLowerCase().trim())) : messages;

  function bottom(behavior = 'smooth') {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: reduced ? 'instant' : behavior });
    nearBottom.current = true;
    setNewBelow(false);
  }
  useLayoutEffect(() => {
    if (!scroll.current || !messages.length) return;
    if (previousHeight.current !== null) {
      scroll.current.scrollTop = scroll.current.scrollHeight - previousHeight.current;
      previousHeight.current = null;
    } else if (initialScroll.current) {
      bottom('instant'); initialScroll.current = false;
    } else if (messages.at(-1).id !== lastMessage.current) {
      if (nearBottom.current || messages.at(-1).senderId === user.id) bottom();
      else setNewBelow(true);
    }
    lastMessage.current = messages.at(-1).id;
  }, [messages, user.id]);
  useEffect(() => {
    if (nearBottom.current && typingNames.length) bottom();
  }, [typingNames.length]);
  useEffect(() => {
    if (!messages.length || !nearBottom.current || document.visibilityState !== 'visible' || search) return;
    onRead();
  }, [messages, onRead, search]);

  function quote(id) {
    const target = document.getElementById(`message-${id}`);
    if (!target) { onInfo('That message is not loaded. Load earlier messages to find it.'); return; }
    setSearch('');
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    target.classList.remove('chat-highlight');
    requestAnimationFrame(() => target.classList.add('chat-highlight'));
  }
  return <section className="chat-conversation" aria-label={`Conversation with ${name}`}>
    <header className="chat-conversation-header">
      <IconButton icon="back" label="Back to conversations" className="chat-mobile-back" onClick={onBack} />
      <Avatar name={name} />
      <div className="chat-header-person"><h2>{name}</h2><p className={typingNames.length || online ? 'is-online' : ''}>{typingNames.length ? `${typingNames.join(', ')} typing…` : conversation.kind === 'group' ? `${people.length} members` : online ? 'Online' : connection === 'connected' ? 'Offline' : 'Presence unavailable'}</p></div>
      <IconButton icon="search" label="Search this conversation" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setSearch(''); }} />
      <IconButton icon="more" label="Conversation details" onClick={() => onInfo()} />
    </header>
    {searchOpen && <div className="chat-conversation-search"><label className="chat-search"><ChatIcon name="search" size={16} /><input type="search" autoFocus aria-label="Search loaded messages" placeholder="Search loaded messages…" value={search} onChange={event => setSearch(event.target.value)} /></label>{search && <span>{filtered.length} found</span>}<IconButton icon="close" label="Close message search" onClick={() => { setSearchOpen(false); setSearch(''); }} /></div>}
    {error && <div className="chat-banner is-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div>}
    <div ref={scroll} className="chat-messages" role="region" aria-label="Message history" aria-busy={loading} tabIndex={0}
      onLoad={() => { if (nearBottom.current) bottom('instant'); }}
      onScroll={() => { const el = scroll.current; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; if (nearBottom.current) { setNewBelow(false); if (!search) onRead(); } }}>
      {hasMore && <button type="button" className="chat-load-older" disabled={loading} onClick={async () => { previousHeight.current = scroll.current.scrollHeight; await onLoadOlder(); }}>{loading ? 'Loading…' : 'Load earlier messages'}</button>}
      {loading && !messages.length && <p className="chat-list-note" role="status">Loading your conversation…</p>}
      {!loading && !messages.length && !error && <div className="chat-thread-empty"><Avatar name={name} /><h3>This is the start.</h3><p>Say hello to {name}. Send a message or share a photo.</p></div>}
      {search && !filtered.length && <p className="chat-list-note">No loaded messages match “{search}”. {hasMore ? 'Load earlier messages to search more history.' : ''}</p>}
      {filtered.map((message, index) => <div key={message.id}>
        {(index === 0 || formatDay(message.createdAt) !== formatDay(filtered[index - 1].createdAt)) && <div className="chat-day">{formatDay(message.createdAt)}</div>}
        <ChatMessage message={message} own={message.senderId === user.id} senderName={findName(message.senderId)} replyName={findName(message.replyTo?.senderId)} loadImage={loadImage} onAction={onAction} onImage={onImage} onQuote={quote}>{renderVerification(message)}</ChatMessage>
      </div>)}
      {!!typingNames.length && <p className="chat-typing" role="status">{typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing<span aria-hidden="true">…</span></p>}
    </div>
    {newBelow && <button type="button" className="chat-new-messages" onClick={() => { bottom(); onRead(); }}><ChatIcon name="arrowDown" size={14} />New messages</button>}
    <MessageComposer draft={draft} onDraft={onDraft} onSend={onSend} onTyping={onTyping} reply={reply} replyName={findName(reply?.senderId)} onCancelReply={onCancelReply} disabled={loading && !messages.length} />
  </section>;
}
