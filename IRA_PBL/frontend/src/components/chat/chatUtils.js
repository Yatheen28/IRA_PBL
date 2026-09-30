export function conversationName(conversation, userId) {
  if (!conversation) return '';
  if (conversation.kind === 'group') return conversation.title;
  return conversation.participants?.find(user => user.id !== userId)?.displayName || conversation.title || 'Conversation';
}

export function messagePreview(message) {
  if (!message) return 'Start the conversation';
  if (message.deleted) return 'Message deleted';
  if (message.kind === 'image') return message.text ? `Photo · ${message.text}` : 'Photo';
  return message.text || '';
}

export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDay(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

export function listTime(value) {
  if (!value) return '';
  const day = formatDay(value);
  return day === 'Today' ? formatTime(value) : day;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'vajra-photo';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
