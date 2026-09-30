const STATUS_ORDER = { sending: 0, sent: 1, delivered: 2, read: 3 };

/** Merge history and live events without duplicate bubbles or regressing receipts. */
export function mergeMessages(current, incoming) {
  const messages = new Map(current.map(message => [message.id, message]));
  for (const next of incoming) {
    const previous = messages.get(next.id);
    if (!previous) { messages.set(next.id, next); continue; }
    const merged = { ...previous, ...next };
    if ((STATUS_ORDER[previous.status] ?? 0) > (STATUS_ORDER[next.status] ?? 0)) merged.status = previous.status;
    if (previous.deleted || next.deleted) {
      merged.deleted = true;
      merged.text = '';
      merged.image = null;
      merged.verification = null;
    }
    messages.set(next.id, merged);
  }
  const deleted = new Set([...messages.values()].filter(message => message.deleted).map(message => message.id));
  return [...messages.values()].map(message => deleted.has(message.replyTo?.id)
    ? { ...message, replyTo: { ...message.replyTo, deleted: true, text: '', image: null } }
    : message).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function totalUnread(conversations) {
  return conversations.reduce((total, conversation) => total + Math.max(0, conversation.unreadCount || 0), 0);
}
