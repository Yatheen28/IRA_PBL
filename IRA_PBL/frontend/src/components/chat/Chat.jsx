import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalChatService } from '../../api/chat';
import { verifyClaim } from '../../api/verification';
import { mergeMessages, totalUnread } from './messageState';
import { saveBlob } from './chatUtils';
import ChatAuth from './ChatAuth';
import ConversationList from './ConversationList';
import Conversation from './Conversation';
import NewChatDialog from './NewChatDialog';
import MessageActions from './MessageActions';
import ChatDialog from './ChatDialog';
import ChatIcon, { Avatar } from './ChatIcon';
import './Chat.css';

// ── Verification result card displayed inline under messages ──────────────────

const VERDICT_COLORS = {
  true: '#22c55e', false: '#ef4444', refuted: '#ef4444', misleading: '#f59e0b',
  partially_true: '#3b82f6', insufficient_evidence: '#6366f1',
  conflicting_evidence: '#f97316', unverified: '#64748b', supported: '#22c55e',
  ai_generated: '#a855f7', authentic: '#22c55e', uncertain: '#64748b',
};

function VerificationCard({ result, onExpand }) {
  if (!result) return null;
  const isImageAnalysis = result._imageAnalysis;
  const color = VERDICT_COLORS[result.verdict?.toLowerCase()] || '#64748b';
  // AI detect uses 'confidence', text verify uses 'analysis_confidence'
  const rawConf = result.analysis_confidence ?? result.confidence;
  const confidence = rawConf != null ? Math.round(rawConf * 100) : null;
  const evidenceCount = result.evidence?.length || 0;
  const verdictLabel = result.verdict?.replace(/_/g, ' ').toUpperCase() || 'ANALYZING';
  return (
    <div className="vajra-verify-card" style={{ borderLeftColor: color }}>
      <div className="vajra-verify-header">
        <ChatIcon name="bolt" size={14} />
        <span>{isImageAnalysis ? '🤖 VAJRA IMAGE ANALYSIS' : '✓ VAJRA VERIFIED'}</span>
      </div>
      <div className="vajra-verify-verdict" style={{ color }}>
        {verdictLabel}
      </div>
      {result.summary && <p className="vajra-verify-summary">{result.summary}</p>}
      {result.original_claim && result._extractedText && (
        <p className="vajra-verify-extracted">Extracted text: "{result.original_claim}"</p>
      )}
      <div className="vajra-verify-meta">
        {confidence != null && <span>Confidence: {confidence}%</span>}
        {!isImageAnalysis && evidenceCount > 0 && (
          <span>{evidenceCount} source{evidenceCount !== 1 ? 's' : ''} analyzed</span>
        )}
        {isImageAnalysis && result.indicators?.length > 0 && (
          <span>{result.indicators.length} indicator{result.indicators.length !== 1 ? 's' : ''} detected</span>
        )}
      </div>
      <button type="button" className="vajra-verify-expand" onClick={onExpand}>
        {isImageAnalysis ? 'View analysis →' : 'View evidence →'}
      </button>
    </div>
  );
}


function VerificationLoading() {
  return (
    <div className="vajra-verify-card vajra-verify-loading">
      <div className="vajra-verify-header">
        <ChatIcon name="bolt" size={14} />
        <span>VAJRA VERIFYING…</span>
      </div>
      <p className="vajra-verify-summary">Retrieving evidence and analyzing sources. This may take a moment.</p>
    </div>
  );
}

// ── Image mode picker dialog ─────────────────────────────────────────────────
function ImageModeDialog({ onChoose, onClose }) {
  return (
    <ChatDialog title="🧠 Analyse Image" onClose={onClose}>
      <p className="chat-dialog-description">
        Choose how to analyse this image:
      </p>
      <div className="vajra-image-mode-list">
        <button
          type="button"
          className="vajra-image-mode-btn"
          onClick={() => onChoose('ai-detect')}
        >
          <span className="vim-icon">🤖</span>
          <span>
            <strong>AI Detection</strong>
            <small>Check if the image was AI-generated using Gemini vision</small>
          </span>
        </button>
        <button
          type="button"
          className="vajra-image-mode-btn"
          onClick={() => onChoose('ocr')}
        >
          <span className="vim-icon">📝</span>
          <span>
            <strong>OCR + Fact Check</strong>
            <small>Extract text from image then run the full VAJRA pipeline</small>
          </span>
        </button>
      </div>
    </ChatDialog>
  );
}

function EvidenceDialog({ result, onClose }) {
  if (!result) return null;
  const evidence = result.evidence || [];
  const top5 = evidence.slice(0, 5);
  const isAI = result._imageAnalysis || result.verdict === 'AI_GENERATED' || result.verdict === 'AUTHENTIC' || result.verdict === 'UNCERTAIN';
  const stanceColors = { supporting: '#22c55e', contradicting: '#ef4444', contextual: '#f59e0b', unclear: '#64748b' };
  return (
    <ChatDialog title={isAI ? 'VAJRA Image Analysis' : 'VAJRA Evidence'} onClose={onClose}>
      {result.summary && <p className="chat-dialog-description">{result.summary}</p>}
      {!isAI && result.reasoning && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Full reasoning ▾
          </summary>
          <p style={{ marginTop: 8, fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--color-text-secondary)' }}>{result.reasoning}</p>
        </details>
      )}
      {/* AI Detection indicators */}
      {isAI && result.indicators?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 12 }}>Detected Indicators:</strong>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {result.indicators.map((ind, i) => <li key={i}>{ind}</li>)}
          </ul>
        </div>
      )}
      {/* Top 5 links */}
      {top5.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>📎 Top Sources</strong>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {top5.map((item, i) => {
              const sc = stanceColors[item.stance?.toLowerCase()] || '#64748b';
              return (
                <li key={i} style={{ fontSize: 11, marginBottom: 7, color: 'var(--color-text-secondary)' }}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#93c5fd', textDecoration: 'none', fontWeight: 600, fontSize: 12 }}>
                    {item.title || item.source_domain || 'Source'}
                  </a>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
                    {item.source_domain && <span style={{ fontFamily: 'monospace' }}>{item.source_domain}</span>}
                    {item.reliability_tier && <span>[{item.reliability_tier}]</span>}
                    {item.stance && <span style={{ color: sc, fontWeight: 700, textTransform: 'uppercase' }}>{item.stance}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <div className="vajra-evidence-list">
        {evidence.map((item, i) => (
          <div key={i} className="vajra-evidence-item">
            <div className="vajra-evidence-rank">#{item.rank || i + 1}</div>
            <div className="vajra-evidence-body">
              <strong>{item.title || 'Source'}</strong>
              <p>{item.content?.slice(0, 200)}{item.content?.length > 200 ? '…' : ''}</p>
              <div className="vajra-evidence-meta">
                {item.source_domain && <span>{item.source_domain}</span>}
                {item.reliability_tier && <span>{item.reliability_tier}</span>}
                {item.stance && <span className={`vajra-stance-${item.stance.toLowerCase()}`}>{item.stance}</span>}
                {item.combined_score != null && <span>Score: {(item.combined_score * 100).toFixed(0)}%</span>}
              </div>
              {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="vajra-evidence-link">Open source ↗</a>}
            </div>
          </div>
        ))}
        {!evidence.length && !isAI && <p className="chat-list-note">No detailed evidence is available for this verification.</p>}
      </div>
      {result.limitations?.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Limitations ({result.limitations.length})
          </summary>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {result.limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </details>
      )}
    </ChatDialog>
  );
}

// ── Profile dialog ──────────────────────────────────────────────────────────

function ProfileDialog({ user, onClose, onLogout }) {
  return (
    <ChatDialog title="Your profile" onClose={onClose}>
      <div className="chat-profile-card">
        <Avatar name={user.displayName} />
        <div><h3>{user.displayName}</h3><p>@{user.username}</p></div>
      </div>
      <p className="chat-dialog-description">Your VAJRA Chat identity on this server. Share your username so other people can find you.</p>
      <p className="chat-presence-note">When you're in a conversation, others can see if you're online. Verification results are visible only to you and are not shared with the conversation.</p>
      <div className="chat-profile-actions">
        <button type="button" className="btn btn-secondary" onClick={onLogout}><ChatIcon name="logout" size={16} />Sign out</button>
      </div>
    </ChatDialog>
  );
}

// ── Photo lightbox ──────────────────────────────────────────────────────────

function PhotoDialog({ data, onClose }) {
  if (!data) return null;
  return (
    <ChatDialog title="Photo" className="chat-photo-dialog" onClose={onClose}>
      <img src={data.url} alt={data.message?.text || 'Photo'} />
      {data.message?.text && <p className="chat-photo-caption">{data.message.text}</p>}
    </ChatDialog>
  );
}

// ── Main Chat component ─────────────────────────────────────────────────────

export default function Chat() {
  // -- State --
  const [session, setSession] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [reply, setReply] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [typing, setTyping] = useState({});
  const [presence, setPresence] = useState({});
  const [verifying, setVerifying] = useState({});
  const [verifications, setVerifications] = useState({});
  const [evidenceView, setEvidenceView] = useState(null);
  const [imageModeDialog, setImageModeDialog] = useState(null); // message waiting for mode pick
  const [actionMessage, setActionMessage] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [photoData, setPhotoData] = useState(null);
  const [infoBanner, setInfoBanner] = useState('');

  const service = useRef(null);

  // -- Initialize local service --
  useEffect(() => {
    const svc = new LocalChatService();
    if (svc.user) {
      service.current = svc;
      setSession(svc.user);
    }
  }, []);

  // -- Handle auth --
  function handleSession(user) {
    if (!service.current) {
      service.current = new LocalChatService();
    }
    service.current.user = user;
    setSession(user);
    loadConversations();
  }

  // -- Load conversations --
  const loadConversations = useCallback(async () => {
    if (!service.current) return;
    setLoading(true);
    try {
      const convos = await service.current.getConversations();
      setConversations(convos);
      setPresence(service.current.getPresence());
      setConnection('connected');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) loadConversations();
  }, [session, loadConversations]);

  // -- Subscribe to real-time events --
  useEffect(() => {
    if (!service.current) return;
    return service.current.subscribe(event => {
      if (event.type === 'message:new') {
        // Update conversations list
        loadConversations();
        // If current conversation, add message
        if (event.conversationId === selectedId) {
          setMessages(prev => mergeMessages(prev, [event.message]));
        }
      } else if (event.type === 'message:status') {
        setMessages(prev => prev.map(m =>
          m.id === event.messageId ? { ...m, status: event.status } : m
        ));
      } else if (event.type === 'message:deleted') {
        setMessages(prev => prev.map(m =>
          m.id === event.messageId ? { ...m, deleted: true, text: '', image: null } : m
        ));
      } else if (event.type === 'typing') {
        setTyping(prev => {
          const convo = { ...(prev[event.conversationId] || {}) };
          if (event.typing) convo[event.userId] = true;
          else delete convo[event.userId];
          return { ...prev, [event.conversationId]: convo };
        });
      }
    });
  }, [service.current, selectedId, loadConversations]);

  // -- Select conversation --
  async function selectConversation(id) {
    setSelectedId(id);
    setReply(null);
    setMsgError('');
    setMsgLoading(true);
    try {
      const result = await service.current.getMessages(id);
      setMessages(result.messages || []);
      setHasMore(result.hasMore || false);
      service.current.markRead(id);
      loadConversations();
    } catch (err) {
      setMsgError(err.message);
      setMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }

  async function loadOlderMessages() {
    // Not applicable in demo mode
    setHasMore(false);
  }

  // -- Send message --
  async function handleSend({ text, file, replyToId }) {
    if (!service.current || !selectedId) return;
    const msg = await service.current.sendMessage(selectedId, { text, file, replyToId });
    setMessages(prev => mergeMessages(prev, [msg]));
    loadConversations();
  }

  // -- New chat --
  async function handleNewChat(userId) {
    if (!service.current) return;
    const convo = await service.current.createConversation(userId);
    loadConversations();
    setNewChatOpen(false);
    selectConversation(convo.id);
  }

  // -- Delete message --
  async function handleDelete(message) {
    if (!service.current || !selectedId) return;
    await service.current.deleteMessage(selectedId, message.id);
    setMessages(prev => prev.map(m =>
      m.id === message.id ? { ...m, deleted: true, text: '', image: null } : m
    ));
    loadConversations();
  }

  // -- Forward message --
  async function handleForward(message, toConvoId) {
    if (!service.current) return;
    await service.current.forwardMessage(message.id, toConvoId);
    loadConversations();
  }

  // -- Copy message --
  async function handleCopy(message) {
    if (message.text) {
      await navigator.clipboard?.writeText(message.text);
    }
  }

  // -- Save image --
  async function handleSave(message) {
    try {
      const blob = await service.current.loadImage(message);
      saveBlob(blob, message.image?.name || 'vajra-photo');
    } catch {
      setInfoBanner('Could not save this photo.');
    }
  }

  // -- Load image for display --
  const loadImage = useCallback(async (message) => {
    if (message.image?.localUrl) {
      const res = await fetch(message.image.localUrl);
      return res.blob();
    }
    if (service.current) return service.current.loadImage(message);
    throw new Error('Image not available');
  }, []);

  // -- Typing --
  function handleTyping(isTyping) {
    service.current?.sendTyping(selectedId, isTyping);
  }

  // -- Mark read --
  const handleRead = useCallback(() => {
    if (service.current && selectedId) {
      service.current.markRead(selectedId);
      setConversations(prev => prev.map(c =>
        c.id === selectedId ? { ...c, unreadCount: 0 } : c
      ));
    }
  }, [selectedId]);

  // -- VAJRA Verification (text messages) --
  async function handleVerify(message) {
    if (!message) return;
    const key = message.id;
    // If already verified, just show result
    if (verifications[key]) {
      setEvidenceView(verifications[key]);
      return;
    }
    // Image messages — open mode picker instead of running immediately
    if (message.kind === 'image') {
      setImageModeDialog(message);
      return;
    }
    // Text message path
    if (!message.text?.trim()) return;
    setVerifying(prev => ({ ...prev, [key]: true }));
    try {
      const result = await verifyClaim(message.text);
      setVerifications(prev => ({ ...prev, [key]: result }));
    } catch (err) {
      setVerifications(prev => ({
        ...prev,
        [key]: {
          verdict: 'unverified',
          summary: `Verification failed: ${err.message}`,
          analysis_confidence: null,
          evidence: [],
          limitations: [],
        },
      }));
    } finally {
      setVerifying(prev => ({ ...prev, [key]: false }));
    }
  }

  // -- VAJRA Image verification (called after mode is chosen) --
  async function handleVerifyImage(message, mode) {
    setImageModeDialog(null);
    const key = message.id;
    setVerifying(prev => ({ ...prev, [key]: true }));
    try {
      if (mode === 'ocr') {
        // OCR + fact-check pipeline
        if (message.text) {
          // Use caption text directly
          const result = await verifyClaim(message.text);
          result._extractedText = true;
          setVerifications(prev => ({ ...prev, [key]: result }));
        } else {
          // Send image to /verify/image (OCR endpoint)
          const blob = message.image?.localUrl
            ? await (await fetch(message.image.localUrl)).blob()
            : await service.current.loadImage(message);
          const form = new FormData();
          form.append('image', blob, message.image?.name || 'chat-image.jpg');
          const resp = await fetch('/verify/image', { method: 'POST', body: form });
          if (!resp.ok) throw new Error(`Backend returned ${resp.status}`);
          const result = await resp.json();
          setVerifications(prev => ({ ...prev, [key]: result }));
        }
      } else {
        // AI image detection
        const blob = message.image?.localUrl
          ? await (await fetch(message.image.localUrl)).blob()
          : await service.current.loadImage(message);
        const form = new FormData();
        form.append('image', blob, message.image?.name || 'chat-image.jpg');
        const resp = await fetch('/verify/image/ai-detect', { method: 'POST', body: form });
        if (!resp.ok) throw new Error(`Backend returned ${resp.status}`);
        const aiResult = await resp.json();
        aiResult._imageAnalysis = true;
        setVerifications(prev => ({ ...prev, [key]: aiResult }));
      }
    } catch (err) {
      setVerifications(prev => ({
        ...prev,
        [key]: {
          verdict: mode === 'ai-detect' ? 'UNCERTAIN' : 'unverified',
          summary: `Analysis failed: ${err.message}`,
          confidence: 0,
          analysis_confidence: null,
          evidence: [],
          indicators: [],
          limitations: ['Analysis service unavailable.'],
          _imageAnalysis: mode === 'ai-detect',
        },
      }));
    } finally {
      setVerifying(prev => ({ ...prev, [key]: false }));
    }
  }

  // -- Render verification inline under messages --
  const renderVerification = useCallback((message) => {
    const key = message.id;
    if (verifying[key]) return <VerificationLoading />;
    if (verifications[key]) {
      return <VerificationCard result={verifications[key]} onExpand={() => setEvidenceView(verifications[key])} />;
    }
    // Show the small verify button on eligible messages
    if (message.text || message.kind === 'image') {
      return (
        <button
          type="button"
          className="vajra-verify-inline"
          title={message.kind === 'image' ? 'Analyse image with VAJRA' : 'Verify with VAJRA'}
          onClick={(e) => { e.stopPropagation(); handleVerify(message); }}
        >
          <ChatIcon name="bolt" size={12} />
          {message.kind === 'image' && <span style={{ fontSize: '0.65rem', marginLeft: 2 }}>Analyse</span>}
        </button>
      );
    }
    return null;
  }, [verifying, verifications]);

  // -- Logout --
  function handleLogout() {
    service.current?.logout();
    service.current = null;
    setSession(null);
    setConversations([]);
    setMessages([]);
    setSelectedId(null);
    setProfileOpen(false);
  }

  // -- Page title with unread count --
  useEffect(() => {
    const unread = totalUnread(conversations);
    document.title = unread > 0 ? `(${unread}) VAJRA Chat` : 'VAJRA Chat';
    return () => { document.title = 'VAJRA AI'; };
  }, [conversations]);

  // -- Not logged in --
  if (!session) {
    return <ChatAuth onSession={async (user) => {
      const svc = new LocalChatService();
      if (user.token) {
        svc.user = user;
        svc.token = user.token;
      }
      service.current = svc;
      handleSession(user);
    }} />;
  }

  const selectedConvo = conversations.find(c => c.id === selectedId);
  const draft = drafts[selectedId] || '';

  return (
    <main id="main-content" className="chat-page">
      {infoBanner && (
        <div className="chat-banner" role="status">
          <span>{infoBanner}</span>
          <button type="button" onClick={() => setInfoBanner('')}>Dismiss</button>
        </div>
      )}
      <div className={`chat-workspace window-card ${selectedId ? 'has-conversation' : ''}`}>
        <ConversationList
          conversations={conversations}
          user={session}
          selectedId={selectedId}
          onSelect={selectConversation}
          onNew={() => setNewChatOpen(true)}
          onProfile={() => setProfileOpen(true)}
          query={query}
          onQuery={setQuery}
          loading={loading}
          connection={connection}
          typing={typing}
        />
        {selectedConvo ? (
          <Conversation
            conversation={selectedConvo}
            user={session}
            messages={messages}
            loading={msgLoading}
            error={msgError}
            hasMore={hasMore}
            onLoadOlder={loadOlderMessages}
            onRetry={() => selectConversation(selectedId)}
            onBack={() => setSelectedId(null)}
            onInfo={(msg) => msg ? setInfoBanner(msg) : setInfoBanner('')}
            onAction={setActionMessage}
            onImage={setPhotoData}
            onSend={handleSend}
            onTyping={handleTyping}
            typing={typing[selectedId] || {}}
            presence={presence}
            connection={connection}
            draft={draft}
            onDraft={text => setDrafts(prev => ({ ...prev, [selectedId]: text }))}
            reply={reply}
            onCancelReply={() => setReply(null)}
            loadImage={loadImage}
            renderVerification={renderVerification}
            onRead={handleRead}
          />
        ) : (
          <section className="chat-conversation" aria-label="No conversation selected">
            <div className="chat-empty-conversation">
              <div className="chat-empty-art"><ChatIcon name="chat" size={36} /></div>
              <h2>Your chats live here.</h2>
              <p>Pick a conversation from the left or start a new one. Send messages, photos, and emojis just like any other messenger. When something seems off, verify it with VAJRA.</p>
              <button type="button" className="btn btn-primary" onClick={() => setNewChatOpen(true)}>
                <ChatIcon name="plus" size={16} /> Start a conversation
              </button>
              <div className="chat-empty-aside">
                <ChatIcon name="bolt" size={18} />
                <p>Every message has a small ⚡ button. Tap it to run a VAJRA check without leaving your conversation. Verification is always your choice — never automatic.</p>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Dialogs */}
      {newChatOpen && (
        <NewChatDialog
          currentUser={session}
          onClose={() => setNewChatOpen(false)}
          onSelect={handleNewChat}
        />
      )}
      {actionMessage && (
        <MessageActions
          message={actionMessage}
          user={session}
          conversations={conversations.filter(c => c.id !== selectedId)}
          onClose={() => setActionMessage(null)}
          onReply={setReply}
          onVerify={handleVerify}
          onCopy={handleCopy}
          onSave={handleSave}
          onDelete={handleDelete}
          onForward={handleForward}
        />
      )}
      {profileOpen && (
        <ProfileDialog user={session} onClose={() => setProfileOpen(false)} onLogout={handleLogout} />
      )}
      {photoData && (
        <PhotoDialog data={photoData} onClose={() => setPhotoData(null)} />
      )}
      {evidenceView && (
        <EvidenceDialog result={evidenceView} onClose={() => setEvidenceView(null)} />
      )}
      {imageModeDialog && (
        <ImageModeDialog
          onChoose={(mode) => handleVerifyImage(imageModeDialog, mode)}
          onClose={() => setImageModeDialog(null)}
        />
      )}
    </main>
  );
}
