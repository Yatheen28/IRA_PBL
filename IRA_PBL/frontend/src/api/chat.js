/**
 * VAJRA Chat API client.
 *
 * All chat-related HTTP calls live here so components stay network-agnostic.
 * The module also exports a lightweight WebSocket manager for real-time events.
 *
 * Backend routes are proxied through Vite (see vite.config.js).
 */

import { API_BASE } from '../utils/constants';

const CHAT_BASE = `${API_BASE}/chat`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Server returned ${response.status}`;
    try {
      const data = await response.json();
      if (data.detail) message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  return response.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login({ username, password }) {
  return request(`${CHAT_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function register({ username, password, displayName }) {
  return request(`${CHAT_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, displayName }),
  });
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(query, token) {
  return request(`${CHAT_BASE}/users?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(token),
  });
}

// ── Conversations ────────────────────────────────────────────────────────────

export async function getConversations(token) {
  return request(`${CHAT_BASE}/conversations`, {
    headers: authHeaders(token),
  });
}

export async function createConversation(participantId, token) {
  return request(`${CHAT_BASE}/conversations`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ participantId }),
  });
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(conversationId, token, { before, limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return request(`${CHAT_BASE}/conversations/${conversationId}/messages?${params}`, {
    headers: authHeaders(token),
  });
}

export async function sendMessage(conversationId, { text, replyToId }, token) {
  return request(`${CHAT_BASE}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ text, replyToId }),
  });
}

export async function sendImageMessage(conversationId, { file, text, replyToId }, token) {
  const form = new FormData();
  form.append('image', file);
  if (text) form.append('text', text);
  if (replyToId) form.append('replyToId', replyToId);
  const response = await fetch(`${CHAT_BASE}/conversations/${conversationId}/messages/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    let message = `Server returned ${response.status}`;
    try { const data = await response.json(); if (data.detail) message = data.detail; } catch { /* */ }
    throw new Error(message);
  }
  return response.json();
}

export async function deleteMessage(conversationId, messageId, token) {
  return request(`${CHAT_BASE}/conversations/${conversationId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
}

export async function forwardMessage(messageId, toConversationId, token) {
  return request(`${CHAT_BASE}/messages/${messageId}/forward`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ toConversationId }),
  });
}

export async function markRead(conversationId, token) {
  return request(`${CHAT_BASE}/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: authHeaders(token),
  });
}

// ── Images ───────────────────────────────────────────────────────────────────

export async function loadMessageImage(messageId, token) {
  const response = await fetch(`${CHAT_BASE}/messages/${messageId}/image`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Photo could not be loaded.');
  return response.blob();
}

// ── WebSocket ────────────────────────────────────────────────────────────────

/**
 * Lightweight WS manager. Handles reconnection with backoff.
 *
 * Usage:
 *   const ws = createChatSocket(token, { onMessage, onStatus });
 *   ws.send({ type: 'typing', conversationId, typing: true });
 *   ws.close();
 */
export function createChatSocket(token, { onMessage, onStatus }) {
  let ws = null;
  let attempt = 0;
  let closed = false;
  let timer = null;

  function status(value) {
    onStatus?.(value);
  }

  function connect() {
    if (closed) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}${CHAT_BASE}/ws?token=${encodeURIComponent(token)}`;
    status('connecting');
    ws = new WebSocket(url);

    ws.onopen = () => {
      attempt = 0;
      status('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch { /* ignore malformed messages */ }
    };

    ws.onclose = () => {
      if (closed) return;
      attempt++;
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      status('reconnecting');
      timer = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return {
    send(data) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },
    close() {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}

// ── Real Chat Service Wrapper ────────────────────────────────────────────────
//
// Wraps the REST API endpoints and WebSocket into the stateful service 
// interface that the React components expect.

export class LocalChatService {
  constructor() {
    this.user = null;
    this.token = null;
    this._listeners = new Set();
    this.ws = null;
    
    // Attempt to restore user from local storage
    try {
      const stored = JSON.parse(localStorage.getItem('vajra_real_user'));
      if (stored && stored.token) {
        this.user = stored;
        this.token = stored.token;
      }
    } catch {}
  }

  _emit(event) {
    this._listeners.forEach(fn => fn(event));
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  
  _connectWs() {
    if (this.ws) this.ws.close();
    if (!this.token) return;
    this.ws = createChatSocket(this.token, {
      onMessage: (msg) => this._emit(msg),
      onStatus: (status) => this._emit({ type: 'ws:status', status })
    });
  }

  async login({ username, password }) {
    const res = await login({ username, password });
    this.user = res;
    this.token = res.token;
    localStorage.setItem('vajra_real_user', JSON.stringify(res));
    this._connectWs();
    return res;
  }

  async register({ username, password, displayName }) {
    const res = await register({ username, password, displayName });
    this.user = res;
    this.token = res.token;
    localStorage.setItem('vajra_real_user', JSON.stringify(res));
    this._connectWs();
    return res;
  }

  async listUsers(query) {
    return listUsers(query, this.token);
  }

  async getConversations() {
    if (this.token && !this.ws) this._connectWs();
    return getConversations(this.token);
  }

  async createConversation(participantId) {
    return createConversation(participantId, this.token);
  }

  async getMessages(conversationId) {
    return getMessages(conversationId, this.token);
  }

  async sendMessage(conversationId, { text, file, replyToId }) {
    if (file) {
      return sendImageMessage(conversationId, { file, text, replyToId }, this.token);
    }
    return sendMessage(conversationId, { text, replyToId }, this.token);
  }

  async deleteMessage(conversationId, messageId) {
    await deleteMessage(conversationId, messageId, this.token);
  }

  async forwardMessage(messageId, toConversationId) {
    return forwardMessage(messageId, toConversationId, this.token);
  }

  async markRead(conversationId) {
    await markRead(conversationId, this.token);
  }

  async loadImage(message) {
    return loadMessageImage(message.id, this.token);
  }

  getPresence() {
    // Rely on WS for presence. The server sends presence events.
    return {};
  }

  sendTyping(conversationId, typing) {
    if (this.ws) {
      this.ws.send({ type: 'typing', conversationId, typing });
    }
  }

  logout() {
    this.user = null;
    this.token = null;
    if (this.ws) this.ws.close();
    this.ws = null;
    localStorage.removeItem('vajra_real_user');
  }
}
