import ChatIcon from './chat/ChatIcon';
import './Header.css';

export default function Header({ mode = 'verify' }) {
  return (
    <header className="header" role="banner">
      <a className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault();
        const main = [...document.querySelectorAll('main')].find(element => element.getClientRects().length);
        if (main) { main.setAttribute('tabindex', '-1'); main.focus(); }
      }}>Skip to content</a>
      <div className={`header-inner container ${mode === 'chat' ? 'header-inner-chat' : ''}`}>
        <a className="header-logo" href="#verify" aria-label="VAJRA home"><ChatIcon name="bolt" size={22} /><span>VAJRA<span className="header-logo-suffix"> AI</span></span></a>
        <nav className="mode-navigation" aria-label="VAJRA experiences">
          <a href="#verify" className={mode === 'verify' ? 'is-active' : ''} aria-current={mode === 'verify' ? 'page' : undefined}><ChatIcon name="search" size={15} /><span>VAJRA AI</span></a>
          <a href="#chat" className={mode === 'chat' ? 'is-active' : ''} aria-current={mode === 'chat' ? 'page' : undefined}><ChatIcon name="chat" size={15} /><span>VAJRA CHAT</span></a>
        </nav>
        <p className="header-tagline">Verify Before You Share</p>
      </div>
    </header>
  );
}
