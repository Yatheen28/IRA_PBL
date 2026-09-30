import { useState } from 'react';
import './KnowledgeGraph.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_TYPES = {
  CLAIM:          { icon: '📌', color: '#2563eb', bg: '#eff6ff', label: 'CLAIM' },
  VERDICT:        { icon: '⚖️', color: '#d97706', bg: '#fefce8', label: 'VERDICT' },
  HISTORY_EVENT:  { icon: '📅', color: '#7c3aed', bg: '#faf5ff', label: 'EVENT' },
  CLAIM_VARIATION:{ icon: '🔀', color: '#0891b2', bg: '#ecfeff', label: 'VARIATION' },
  EVIDENCE:       { icon: '🔍', color: '#16a34a', bg: '#f0fdf4', label: 'EVIDENCE' },
  FACT_CHECK:     { icon: '✅', color: '#ea580c', bg: '#fff7ed', label: 'FACT-CHECK' },
  SCIENTIFIC:     { icon: '🔬', color: '#0f172a', bg: '#f8fafc', label: 'SCIENCE' },
  OFFICIAL:       { icon: '🏛️', color: '#475569', bg: '#f1f5f9', label: 'OFFICIAL' },
  SOURCE:         { icon: '🌐', color: '#64748b', bg: '#f8fafc', label: 'SOURCE' },
};

const TIMELINE_COLORS = {
  'Origin':              '#7c3aed',
  'First Reported':      '#2563eb',
  'Circulation':         '#0891b2',
  'Viral Spread':        '#ea580c',
  'Claim Variation':     '#0891b2',
  'Fact-Check':          '#16a34a',
  'Official Response':   '#475569',
  'Scientific Evidence': '#0f172a',
  'Challenge':           '#dc2626',
  'Current Assessment':  '#16a34a',
};

const STANCE_CONFIG = {
  supports:      { icon: '🟢', color: '#16a34a', label: 'SUPPORTS' },
  supporting:    { icon: '🟢', color: '#16a34a', label: 'SUPPORTS' },
  contradicts:   { icon: '🔴', color: '#dc2626', label: 'CONTRADICTS' },
  contradicting: { icon: '🔴', color: '#dc2626', label: 'CONTRADICTS' },
  context:       { icon: '🟡', color: '#d97706', label: 'CONTEXT' },
  contextual:    { icon: '🟡', color: '#d97706', label: 'CONTEXT' },
  unclear:       { icon: '⚪', color: '#64748b', label: 'UNCLEAR' },
};

const STATUS_CONFIG = {
  'Supported':              { icon: '✅', color: '#16a34a' },
  'Contradicted':           { icon: '❌', color: '#dc2626' },
  'Partially Supported':    { icon: '◑', color: '#2563eb' },
  'Misleading':             { icon: '⚠️', color: '#d97706' },
  'Insufficient Evidence':  { icon: '❓', color: '#7c3aed' },
  'Sources Disagree':       { icon: '⇄', color: '#ea580c' },
};

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ node, onClose }) {
  if (!node) return null;
  const d = node.data || {};
  const nt = NODE_TYPES[node.nodeType] || NODE_TYPES.EVIDENCE;

  return (
    <div className="kg-detail-overlay" onClick={onClose}>
      <div className="kg-detail-panel" onClick={e => e.stopPropagation()}>
        <div className="kg-detail-header" style={{ borderColor: nt.color }}>
          <span className="kg-detail-icon">{nt.icon}</span>
          <div>
            <span className="kg-detail-type" style={{ color: nt.color }}>{nt.label}</span>
            <h3 className="kg-detail-title">{d.label || d.title || 'Node'}</h3>
          </div>
          <button className="kg-detail-close" onClick={onClose}>✕</button>
        </div>
        <div className="kg-detail-body">
          {/* CLAIM */}
          {node.nodeType === 'CLAIM' && (
            <>
              <p className="kg-detail-full-text">"{d.full_text}"</p>
              {d.verdict && <div className="kg-detail-row"><strong>Verdict:</strong> <span>{d.verdict}</span></div>}
            </>
          )}
          {/* HISTORY EVENT */}
          {node.nodeType === 'HISTORY_EVENT' && (
            <>
              <div className="kg-detail-row"><strong>Type:</strong> <span>{d.type}</span></div>
              <div className="kg-detail-row"><strong>Date:</strong> <span>{d.date || 'Unknown'}</span></div>
              {d.description && <p className="kg-detail-desc">{d.description}</p>}
              {d.source && <div className="kg-detail-row"><strong>Source:</strong> <span>{d.source}</span></div>}
              {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="kg-detail-link">Open source ↗</a>}
            </>
          )}
          {/* CLAIM VARIATION */}
          {node.nodeType === 'CLAIM_VARIATION' && (
            <>
              {d.text && <p className="kg-detail-full-text">"{d.text}"</p>}
              <div className="kg-detail-row"><strong>When:</strong> <span>{d.when || 'Unknown'}</span></div>
              <div className="kg-detail-row"><strong>Where:</strong> <span>{d.where || 'Unknown'}</span></div>
              {d.source && <div className="kg-detail-row"><strong>Source:</strong> <span>{d.source}</span></div>}
              {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="kg-detail-link">Open source ↗</a>}
            </>
          )}
          {/* EVIDENCE */}
          {node.nodeType === 'EVIDENCE' && (
            <>
              {d.summary && <p className="kg-detail-desc">{d.summary}</p>}
              {d.stance && (
                <div className="kg-detail-row">
                  <strong>Stance:</strong>
                  <span style={{ color: STANCE_CONFIG[d.stance]?.color || '#64748b', fontWeight: 700 }}>
                    {STANCE_CONFIG[d.stance]?.icon} {STANCE_CONFIG[d.stance]?.label || d.stance.toUpperCase()}
                  </span>
                </div>
              )}
              {d.publication_date && <div className="kg-detail-row"><strong>Date:</strong> <span>{d.publication_date}</span></div>}
              {d.source && <div className="kg-detail-row"><strong>Source:</strong> <span>{d.source}</span></div>}
              {d.reliability_tier && (
                <div className="kg-detail-row">
                  <strong>Reliability:</strong>
                  <span style={{
                    color: d.reliability_tier === 'HIGH' ? '#16a34a'
                         : d.reliability_tier === 'MEDIUM' ? '#d97706' : '#dc2626',
                    fontWeight: 700
                  }}>{d.reliability_tier}</span>
                </div>
              )}
              {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="kg-detail-link">Open source ↗</a>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 1. Timeline View ──────────────────────────────────────────────────────────

function TimelineView({ graph, onNodeClick }) {
  const timeline   = graph.timeline   || [];
  const variations = graph.variations || [];
  const spreadPath = graph.spread_path || [];
  const debunkPath = graph.debunking_path || [];

  function TimelineNode({ item, index, total }) {
    const color = TIMELINE_COLORS[item.type] || '#64748b';
    const isLast = index === total - 1;
    const nodeData = {
      nodeType: 'HISTORY_EVENT',
      data: {
        label:       item.title,
        type:        item.type,
        date:        item.date,
        description: item.description,
        source:      item.source,
        url:         item.url,
      }
    };
    return (
      <div className="tl-event-row">
        <div className="tl-connector-col">
          <div className="tl-dot" style={{ borderColor: color, background: color }} />
          {!isLast && <div className="tl-line" style={{ background: color + '40' }} />}
        </div>
        <div className="tl-event-card" style={{ borderLeftColor: color }}
          onClick={() => onNodeClick(nodeData)} role="button" tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onNodeClick(nodeData)}>
          <div className="tl-event-meta">
            <span className="tl-event-type" style={{ color }}>{item.type}</span>
            <span className="tl-event-date">{item.date || 'Unknown date'}</span>
          </div>
          <div className="tl-event-title">{item.title}</div>
          {item.description && <p className="tl-event-desc">{item.description}</p>}
          <div className="tl-event-footer">
            {item.source && <span className="tl-event-source">📎 {item.source}</span>}
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="tl-event-link" onClick={e => e.stopPropagation()}>
                Open ↗
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kg-timeline-view">
      {/* Claim Origin Timeline */}
      <section className="kg-section">
        <h3 className="kg-section-title">
          <span className="kg-section-icon">📅</span> Claim History Timeline
        </h3>
        {timeline.length > 0 ? (
          <div className="tl-track">
            {timeline.map((item, i) => (
              <TimelineNode key={item.id} item={item} index={i} total={timeline.length} />
            ))}
          </div>
        ) : (
          <p className="kg-empty-note">No timeline data established from available evidence.</p>
        )}
      </section>

      {/* Claim Variations */}
      {variations.length > 0 && (
        <section className="kg-section">
          <h3 className="kg-section-title">
            <span className="kg-section-icon">🔀</span> Claim Variations
          </h3>
          <p className="kg-section-note">Different versions of the claim found in evidence:</p>
          <div className="kg-variations-grid">
            {variations.map((v, i) => {
              const nodeData = { nodeType: 'CLAIM_VARIATION', data: { label: v.text?.slice(0, 60), ...v } };
              return (
                <div key={v.id} className="kg-variation-card"
                  onClick={() => onNodeClick(nodeData)} role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onNodeClick(nodeData)}>
                  <div className="kg-variation-num">Variation {i + 1}</div>
                  <p className="kg-variation-text">"{v.text}"</p>
                  <div className="kg-variation-meta">
                    <span>{v.when || 'Unknown date'}</span>
                    {v.where && <span>· {v.where}</span>}
                  </div>
                  {v.url && (
                    <a href={v.url} target="_blank" rel="noopener noreferrer"
                      className="tl-event-link" onClick={e => e.stopPropagation()}>
                      Source ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Spread Path */}
      {spreadPath.length > 0 && (
        <section className="kg-section">
          <h3 className="kg-section-title">
            <span className="kg-section-icon">📡</span> How the Claim Spread
          </h3>
          <div className="kg-spread-chain">
            {spreadPath.map((step, i) => (
              <div key={step.id} className="kg-spread-row">
                <div className="kg-spread-card">
                  <div className="kg-spread-label">{step.label}</div>
                  <div className="kg-spread-meta">
                    {step.date && <span>{step.date}</span>}
                    {step.source && <span>· {step.source}</span>}
                  </div>
                  {step.url && <a href={step.url} target="_blank" rel="noopener noreferrer" className="tl-event-link">Source ↗</a>}
                </div>
                {i < spreadPath.length - 1 && <div className="kg-spread-arrow">↓</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Debunking Path */}
      {debunkPath.length > 0 ? (
        <section className="kg-section">
          <h3 className="kg-section-title">
            <span className="kg-section-icon">🔎</span> Challenge / Debunking Path
          </h3>
          <div className="kg-debunk-chain">
            {debunkPath.map((step, i) => (
              <div key={step.id} className="kg-spread-row">
                <div className="kg-debunk-card">
                  <div className="kg-spread-label">{step.label}</div>
                  {step.description && <p className="tl-event-desc">{step.description}</p>}
                  <div className="kg-spread-meta">
                    {step.date && <span>{step.date}</span>}
                    {step.source && <span>· {step.source}</span>}
                  </div>
                  {step.url && <a href={step.url} target="_blank" rel="noopener noreferrer" className="tl-event-link">Source ↗</a>}
                </div>
                {i < debunkPath.length - 1 && <div className="kg-spread-arrow">↓</div>}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="kg-section">
          <h3 className="kg-section-title">
            <span className="kg-section-icon">🔎</span> Challenge / Debunking Path
          </h3>
          <p className="kg-empty-note kg-empty-note--info">
            No reliable debunking evidence identified from available sources.
          </p>
        </section>
      )}
    </div>
  );
}

// ── 2. Evidence Map View ──────────────────────────────────────────────────────

function EvidenceMapView({ graph, claim, onNodeClick }) {
  const evNodes = graph.evidence_nodes || [];
  const supports     = evNodes.filter(e => ['supports','supporting'].includes(e.stance));
  const contradicts  = evNodes.filter(e => ['contradicts','contradicting'].includes(e.stance));
  const context      = evNodes.filter(e => ['context','contextual','unclear'].includes(e.stance));

  const currentStatus = graph.current_status || '';
  const statusConf    = STATUS_CONFIG[currentStatus] || { icon: '~', color: '#64748b' };

  function EvidenceCard({ ev, color }) {
    const nodeData = { nodeType: 'EVIDENCE', data: { label: ev.title, ...ev } };
    return (
      <div className="kg-ev-card" style={{ borderColor: color }}
        onClick={() => onNodeClick(nodeData)} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onNodeClick(nodeData)}>
        <div className="kg-ev-title">{ev.title?.slice(0, 70) || 'Evidence'}</div>
        {ev.summary && <p className="kg-ev-summary">{ev.summary.slice(0, 130)}…</p>}
        <div className="kg-ev-meta">
          {ev.source && <span className="kg-ev-source">{ev.source}</span>}
          {ev.publication_date && ev.publication_date !== 'Unknown' && (
            <span className="kg-ev-date">{ev.publication_date}</span>
          )}
          {ev.reliability_tier && (
            <span className="kg-ev-tier" style={{
              color: ev.reliability_tier === 'HIGH' ? '#16a34a'
                   : ev.reliability_tier === 'MEDIUM' ? '#d97706' : '#dc2626'
            }}>[{ev.reliability_tier}]</span>
          )}
        </div>
        {ev.url && (
          <a href={ev.url} target="_blank" rel="noopener noreferrer"
            className="tl-event-link" onClick={e => e.stopPropagation()}>
            Source ↗
          </a>
        )}
      </div>
    );
  }

  function EvidenceColumn({ title, icon, color, items, emptyMsg }) {
    return (
      <div className="kg-ev-col">
        <div className="kg-ev-col-header" style={{ color }}>
          <span>{icon}</span> {title}
          <span className="kg-ev-col-count">{items.length}</span>
        </div>
        <div className="kg-ev-col-line" style={{ background: color }} />
        {items.length > 0 ? (
          <div className="kg-ev-col-cards">
            {items.map((ev, i) => <EvidenceCard key={ev.id || i} ev={ev} color={color} />)}
          </div>
        ) : (
          <p className="kg-empty-note">{emptyMsg}</p>
        )}
      </div>
    );
  }

  return (
    <div className="kg-evidence-map">
      {/* Central claim node */}
      <div className="kg-claim-node"
        onClick={() => onNodeClick({ nodeType: 'CLAIM', data: { label: claim, full_text: claim, verdict: currentStatus } })}
        role="button" tabIndex={0}>
        <div className="kg-claim-icon">📌</div>
        <div className="kg-claim-label">CLAIM</div>
        <div className="kg-claim-text">"{claim?.slice(0, 100)}{claim?.length > 100 ? '…' : ''}"</div>
      </div>

      {/* Connector line */}
      <div className="kg-map-connector">
        <div className="kg-map-line" />
        <div className="kg-map-branches">
          <div className="kg-branch-label" style={{ color: '#16a34a' }}>SUPPORTS</div>
          <div className="kg-branch-label" style={{ color: '#dc2626' }}>CONTRADICTS</div>
          <div className="kg-branch-label" style={{ color: '#d97706' }}>CONTEXT</div>
        </div>
      </div>

      {/* Evidence columns */}
      <div className="kg-ev-columns">
        <EvidenceColumn
          title="Supports"
          icon="🟢"
          color="#16a34a"
          items={supports}
          emptyMsg="No supporting evidence found."
        />
        <EvidenceColumn
          title="Contradicts"
          icon="🔴"
          color="#dc2626"
          items={contradicts}
          emptyMsg="No contradicting evidence found."
        />
        <EvidenceColumn
          title="Provides Context"
          icon="🟡"
          color="#d97706"
          items={context}
          emptyMsg="No contextual evidence found."
        />
      </div>

      {/* Current Status */}
      <div className="kg-status-block" style={{ borderColor: statusConf.color }}>
        <div className="kg-status-label">CURRENT STATUS</div>
        <div className="kg-status-verdict" style={{ color: statusConf.color }}>
          {statusConf.icon} {currentStatus || 'Unknown'}
        </div>
        {graph.current_status_summary && (
          <p className="kg-status-summary">{graph.current_status_summary}</p>
        )}
      </div>
    </div>
  );
}

// ── Main KnowledgeGraph ───────────────────────────────────────────────────────

export default function KnowledgeGraph({ graph, claim }) {
  const [view, setView]       = useState('timeline');
  const [selected, setSelected] = useState(null);

  if (!graph) {
    return <div className="kg-empty-note">No knowledge graph data available.</div>;
  }

  const hasTimeline  = (graph.timeline || []).length > 0;
  const hasEvidence  = (graph.evidence_nodes || []).length > 0;

  return (
    <div className="kg-root">
      {/* View toggle */}
      <div className="kg-view-toggle">
        <button
          className={`kg-toggle-btn ${view === 'timeline' ? 'active' : ''}`}
          onClick={() => setView('timeline')}
        >
          📅 Claim Timeline
        </button>
        <button
          className={`kg-toggle-btn ${view === 'evidence' ? 'active' : ''}`}
          onClick={() => setView('evidence')}
        >
          🔍 Evidence Map
        </button>
      </div>

      {/* Content */}
      <div className="kg-content">
        {view === 'timeline' && (
          <TimelineView
            graph={graph}
            onNodeClick={setSelected}
          />
        )}
        {view === 'evidence' && (
          <EvidenceMapView
            graph={graph}
            claim={claim}
            onNodeClick={setSelected}
          />
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel node={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
