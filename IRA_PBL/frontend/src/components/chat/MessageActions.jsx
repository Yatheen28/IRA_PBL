import { useState } from 'react';
import ChatDialog from './ChatDialog';
import ChatIcon, { Avatar } from './ChatIcon';
import { conversationName, messagePreview } from './chatUtils';

export default function MessageActions({ message, user, conversations, onClose, onReply, onVerify, onCopy, onSave, onDelete, onForward }) {
  const [step, setStep] = useState('actions');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function perform(action) {
    if (pending) return;
    setPending(true); setError('');
    try { await action(); onClose(); }
    catch (err) { setError(err.message || 'Could not complete this action. Try again.'); }
    finally { setPending(false); }
  }
  return <ChatDialog title={step === 'forward' ? 'Forward to…' : step === 'delete' ? 'Delete this message?' : 'Message options'} className="chat-action-dialog" onClose={() => { if (!pending) onClose(); }}>
    <p className="chat-action-preview">{messagePreview(message)}</p>
    {error && <p className="chat-form-error" role="alert">{error}</p>}
    {step === 'actions' && <div className="chat-action-list">
      <button type="button" onClick={() => { onReply(message); onClose(); }}><ChatIcon name="reply" />Reply</button>
      <button type="button" onClick={() => setStep('forward')}><ChatIcon name="forward" />Forward</button>
      {message.text && <button type="button" disabled={pending} onClick={() => perform(() => onCopy(message))}><ChatIcon name="copy" />Copy text</button>}
      {message.kind === 'image' && <button type="button" disabled={pending} onClick={() => perform(() => onSave(message))}><ChatIcon name="download" />Save photo</button>}
      {message.senderId === user.id && <button type="button" className="is-danger" onClick={() => setStep('delete')}><ChatIcon name="trash" />Delete for everyone</button>}
      <button type="button" className="is-verify" onClick={() => { onClose(); onVerify(message); }}><ChatIcon name="bolt" />Verify with VAJRA</button>
    </div>}
    {step === 'forward' && <>
      <p className="chat-dialog-description">Choose an existing conversation. The recipient will see a forwarded label.</p>
      <div className="chat-people-list">{conversations.map(conversation => <button type="button" className="chat-person" disabled={pending} key={conversation.id} onClick={() => perform(() => onForward(message, conversation.id))}>
        <Avatar name={conversationName(conversation, user.id)} /><span><strong>{conversationName(conversation, user.id)}</strong></span><ChatIcon name="forward" size={18} />
      </button>)}</div>
    </>}
    {step === 'delete' && <>
      <p className="chat-dialog-description">This removes the message and its attached verification from the conversation. Other people may already have copied or saved it. This cannot be undone.</p>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => perform(() => onDelete(message))}>{pending ? 'Deleting…' : 'Delete message'}</button>
    </>}
    {step !== 'actions' && <button className="chat-text-button" type="button" disabled={pending} onClick={() => { setStep('actions'); setError(''); }}>Back to message options</button>}
    {step === 'actions' && message.senderId !== user.id && <p className="chat-dialog-description">Only the sender can delete this message for everyone.</p>}
  </ChatDialog>;
}
