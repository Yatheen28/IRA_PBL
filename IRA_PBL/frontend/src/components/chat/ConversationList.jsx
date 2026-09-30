import ChatIcon, { Avatar, IconButton } from './ChatIcon';
import { conversationName, listTime, messagePreview } from './chatUtils';

export default function ConversationList({ conversations, user, selectedId, onSelect, onNew, onProfile, query, onQuery, loading, connection, typing }) {
  const filtered = conversations.filter(conversation => {
    const value = query.toLowerCase().trim();
    return `${conversationName(conversation, user.id)} ${conversation.participants?.map(person => person.username).join(' ')}`.toLowerCase().includes(value);
  });
  return <aside className="chat-sidebar" aria-label="Conversations">
    <div className="chat-sidebar-heading"><div><span className="label-caps">VAJRA CHAT</span><h1>Messages<span className="chat-count">{conversations.length}</span></h1></div><IconButton icon="plus" label="New chat" className="chat-new-button" onClick={onNew} /></div>
    <label className="chat-search"><ChatIcon name="search" size={18} /><input type="search" placeholder="Search conversations" aria-label="Search conversations" value={query} onChange={event => onQuery(event.target.value)} /></label>
    <div className="chat-list-label"><span className="label-caps">All conversations</span><span className={`chat-connection-dot ${connection === 'connected' ? 'is-connected' : ''}`} title={connection === 'connected' ? 'Connected to chat server' : 'Reconnecting to chat server'} /></div>
    <div className="chat-conversation-list" aria-busy={loading}>
      {loading && !conversations.length && <div className="chat-list-skeleton" role="status" aria-label="Loading conversations"><span /><span /><span /></div>}
      {!loading && !filtered.length && <div className="chat-list-empty"><ChatIcon name={query ? 'search' : 'chat'} size={30} /><h2>{query ? 'No matches yet.' : 'Say the first hello.'}</h2><p>{query ? 'Try a different name or username.' : 'Start a chat with someone you know. Your conversations will appear here.'}</p>{!query && <button type="button" className="chat-text-button" onClick={onNew}>Find a person <ChatIcon name="forward" size={16} /></button>}</div>}
      {filtered.map(conversation => {
        const name = conversationName(conversation, user.id);
        const isTyping = Object.keys(typing[conversation.id] || {}).length > 0;
        return <button key={conversation.id} type="button" className={`chat-list-item ${selectedId === conversation.id ? 'is-selected' : ''}`} aria-current={selectedId === conversation.id ? 'true' : undefined} onClick={() => onSelect(conversation.id)}>
          <Avatar name={name} /><span className="chat-list-content"><span className="chat-list-top"><strong>{name}</strong><time dateTime={conversation.lastMessage?.createdAt || conversation.updatedAt}>{listTime(conversation.lastMessage?.createdAt || conversation.updatedAt)}</time></span><span className="chat-list-bottom"><span className={isTyping ? 'chat-typing-text' : ''}>{isTyping ? 'typing…' : `${conversation.lastMessage?.senderId === user.id ? 'You: ' : ''}${messagePreview(conversation.lastMessage)}`}</span>{conversation.unreadCount > 0 && <span className="chat-unread" aria-label={`${conversation.unreadCount} unread messages`}>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}</span></span>
        </button>;
      })}
    </div>
    <button type="button" className="chat-self" onClick={onProfile}><Avatar name={user.displayName} small /><span><strong>{user.displayName}</strong><small>@{user.username}</small></span><ChatIcon name="more" size={19} /></button>
  </aside>;
}
