import { useEffect, useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Verifier from './components/Verifier';
import Chat from './components/chat/Chat';
import './App.css';

function currentMode() {
  return window.location.hash.startsWith('#chat') ? 'chat' : 'verify';
}

export default function App() {
  const [mode, setMode] = useState(currentMode);
  useEffect(() => {
    const change = () => {
      // In-page evidence/skip anchors must not navigate away from the active mode.
      if (location.hash === '#verify' || location.hash.startsWith('#chat')) setMode(currentMode());
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return <div className={`app ${mode === 'chat' ? 'app-chat' : ''}`}>
    <Header mode={mode} />
    <div className="mode-panel" hidden={mode !== 'verify'}><Verifier /></div>
    {mode === 'chat' && <Chat />}
    {mode === 'verify' && <Footer />}
  </div>;
}
