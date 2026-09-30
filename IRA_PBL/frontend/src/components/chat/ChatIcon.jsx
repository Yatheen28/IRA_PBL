const paths = {
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />,
  chat: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2A8.5 8.5 0 0 1 21 11.5Z" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m12 5-7 7 7 7M5 12h15" />,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="m22 2-11 11" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01" /></>,
  attach: <path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2a3 3 0 0 1 4 4L7 16a1 1 0 0 1-2-2l9-9" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="1" /><circle cx="8" cy="8" r="1" /><path d="m3 17 5-5 4 4 4-6 5 7" /></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3V7Z" /><circle cx="12" cy="13" r="4" /></>,
  file: <><path d="M5 2h9l5 5v15H5V2Zm9 0v6h5M8 13h8M8 17h6" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  reply: <><path d="m9 5-6 6 6 6M3 11h11a7 7 0 0 1 7 7" /></>,
  forward: <><path d="m15 5 6 6-6 6M21 11H10a7 7 0 0 0-7 7" /></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="1" /><path d="M16 8V3H3v13h5" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  check: <path d="m4 12 5 5L20 6" />,
  checks: <><path d="m2 12 5 5L18 6M12 17 23 6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  logout: <><path d="M9 3H3v18h6M8 12h13m-5-5 5 5-5 5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  arrowDown: <path d="M12 4v16m-6-6 6 6 6-6" />,
};

export default function ChatIcon({ name, size = 20, className = '' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name] || paths.chat}</svg>;
}

export function IconButton({ icon, label, className = '', ...props }) {
  return <button type="button" className={`chat-icon-button ${className}`} aria-label={label} title={label} {...props}><ChatIcon name={icon} /></button>;
}

export function Avatar({ name = '?', small = false }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <span className={`chat-avatar ${small ? 'chat-avatar-small' : ''}`} aria-hidden="true">{initials || '?'}</span>;
}
