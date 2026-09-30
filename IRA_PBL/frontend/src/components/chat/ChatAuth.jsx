import { useState } from 'react';
import { LocalChatService } from '../../api/chat';
import ChatIcon from './ChatIcon';

export default function ChatAuth({ onSession }) {
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    setPending(true);
    try {
      const credentials = { username: data.get('username').trim(), password: data.get('password'), displayName: data.get('displayName')?.trim() };
      const svc = new LocalChatService();
      const user = await (creating ? svc.register(credentials) : svc.login(credentials));
      onSession(user);
    } catch (err) { setError(err.message || 'Could not connect. Please try again.'); }
    finally { setPending(false); }
  }
  return <main id="main-content" className="chat-auth-page">
    <section className="chat-auth-intro">
      <span className="label-caps chat-eyebrow"><ChatIcon name="chat" size={16} /> Introducing VAJRA Chat</span>
      <h1>Your people.<br />Your conversations.</h1>
      <p>A space for everyday messages, photos, and everything in between. With a second look at the things worth checking.</p>
      <div className="chat-auth-feature"><span className="chat-feature-symbol"><ChatIcon name="bolt" /></span><div><strong>Talk first. Verify when you want.</strong><p>Check a message with VAJRA without leaving your conversation. No bots. No automatic AI replies.</p></div></div>
      <p className="chat-auth-footnote mono">ALREADY HERE FOR VERIFICATION? <a href="#verify">Open VAJRA AI ↗</a></p>
    </section>
    <section className="window-card chat-auth-card" aria-label="Chat account">
      <div className="window-titlebar"><div className="window-dots"><span /><span /></div> VAJRA CHAT / YOUR ACCOUNT</div>
      <div className="chat-auth-form-wrap">
        <h2>{creating ? 'Make yourself at home.' : 'Welcome back.'}</h2>
        <p>{creating ? 'Choose a username so your people can find you.' : 'Sign in to pick up the conversation.'}</p>
        <form onSubmit={submit} className="chat-auth-form">
          {creating && <label>Display name<input name="displayName" autoComplete="name" required maxLength={60} placeholder="How people know you" disabled={pending} /></label>}
          <label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck="false" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" title="3–32 letters, numbers, or underscores" placeholder="your_username" disabled={pending} /></label>
          <label>Password<input name="password" type="password" autoComplete={creating ? 'new-password' : 'current-password'} required minLength={creating ? 8 : undefined} maxLength={128} placeholder={creating ? 'At least 8 characters' : 'Your password'} disabled={pending} /></label>
          {error && <p className="chat-form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Connecting…' : creating ? 'Create account' : 'Sign in'}<ChatIcon name="forward" size={17} /></button>
        </form>
        <p className="chat-auth-switch">{creating ? 'Already have an account?' : 'New to VAJRA Chat?'} <button type="button" disabled={pending} onClick={() => { setCreating(!creating); setError(''); }}>{creating ? 'Sign in' : 'Create an account'}</button></p>
        <p className="chat-account-note">Messages are stored on this VAJRA server. Chat is not end-to-end encrypted. Use a unique password.</p>
      </div>
    </section>
  </main>;
}
