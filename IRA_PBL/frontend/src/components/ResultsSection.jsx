import { useState } from 'react';
import EvidenceCard from './EvidenceCard';
import KnowledgeGraph from './KnowledgeGraph';
import './ResultsSection.css';

// ── Verdict config ────────────────────────────────────────────────────────────
const VERDICT_META = {
  true:                  { label: 'TRUE',                  color: '#16a34a', icon: '✓' },
  false:                 { label: 'FALSE',                 color: '#dc2626', icon: '✗' },
  misleading:            { label: 'MISLEADING',            color: '#d97706', icon: '⚠' },
  partially_true:        { label: 'PARTIALLY TRUE',        color: '#2563eb', icon: '◑' },
  insufficient_evidence: { label: 'INSUFFICIENT EVIDENCE', color: '#7c3aed', icon: '?' },
  conflicting_evidence:  { label: 'CONFLICTING EVIDENCE',  color: '#ea580c', icon: '⇄' },
  unverified:            { label: 'UNVERIFIED',            color: '#64748b', icon: '~' },
  ai_generated:          { label: 'AI GENERATED',          color: '#7c3aed', icon: '🤖' },
  authentic:             { label: 'AUTHENTIC',             color: '#16a34a', icon: '📷' },
  uncertain:             { label: 'UNCERTAIN',             color: '#64748b', icon: '?' },
};

const STANCE_COLORS = {
  supporting:    '#16a34a',
  supporting_evidence: '#16a34a',
  contradicting: '#dc2626',
  refuting:      '#dc2626',
  contextual:    '#d97706',
  unclear:       '#64748b',
};

function VerdictBadge({ verdict, confidence }) {
  const v = VERDICT_META[verdict?.toLowerCase()] ?? {
    label: verdict?.toUpperCase().replace(/_/g, ' ') ?? 'UNKNOWN',
    color: '#64748b', icon: '~',
  };
  return (
    <div className="verdict-badge-row">
      <span className="verdict-badge" style={{ color: v.color, borderColor: v.color, background: v.color + '14' }}>
        <span className="verdict-icon">{v.icon}</span> {v.label}
      </span>
      {confidence != null && (
        <span className="confidence-pill">
          Confidence: <strong>{Math.round(confidence * 100)}%</strong>
        </span>
      )}
    </div>
  );
}

// ── Static Knowledge Graph (flowchart) ────────────────────────────────────────
const NODE_TYPE_COLOR = {
  claim:    { bg: '#eff6ff', stroke: '#2563eb', text: '#1e40af' },
  verdict:  { bg: '#fefce8', stroke: '#d97706', text: '#92400e' },
  evidence: { bg: '#f0fdf4', stroke: '#16a34a', text: '#14532d' },
  source:   { bg: '#faf5ff', stroke: '#7c3aed', text: '#4c1d95' },
};

function StaticKnowledgeGraph({ graph }) {
  if (!graph || !graph.nodes?.length) {
    return <div className="kg-empty">No knowledge graph data available.</div>;
  }

  const nodes = graph.nodes;
  const edges = graph.edges || [];

  // ── Layout: column-based (claim → evidence → source) ────────────────
  const COLS = { claim: 0, verdict: 0, evidence: 1, source: 2 };
  const COL_X = [60, 340, 620];
  const NODE_W = 220, NODE_H = 56, GAP_Y = 80;

  // Group by column
  const columns = [[], [], []];
  nodes.forEach(n => {
    const type = n.data?.nodeType || n.type || 'source';
    const col = COLS[type] ?? 2;
    columns[col].push({ ...n, _type: type });
  });

  // Assign Y positions per column
  const positions = {};
  columns.forEach((col, ci) => {
    col.forEach((node, ri) => {
      const totalH = col.length * (NODE_H + GAP_Y) - GAP_Y;
      const startY = Math.max(60, 300 - totalH / 2);
      positions[node.id] = {
        x: COL_X[ci],
        y: startY + ri * (NODE_H + GAP_Y),
      };
    });
  });

  // SVG canvas size
  const maxY = Math.max(...Object.values(positions).map(p => p.y)) + NODE_H + 60;
  const svgW = 900, svgH = Math.max(400, maxY);

  return (
    <div className="kg-wrap">
      <svg
        className="kg-svg-static"
        viewBox={`0 0 ${svgW} ${svgH}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Knowledge graph flowchart"
      >
        <defs>
          <marker id="kg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
          </marker>
          {Object.entries(STANCE_COLORS).map(([k, c]) => (
            <marker key={k} id={`kg-arrow-${k}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={c} />
            </marker>
          ))}
        </defs>

        {/* Column headers */}
        {['CLAIM / VERDICT', 'EVIDENCE', 'SOURCES'].map((label, i) => (
          <text key={i} x={COL_X[i] + NODE_W / 2} y={36} textAnchor="middle"
            fontSize="10" fontWeight="700" fill="#94a3b8" fontFamily="monospace"
            letterSpacing="0.08em">
            {label}
          </text>
        ))}

        {/* Separator lines */}
        {[270, 550].map((x, i) => (
          <line key={i} x1={x} y1={20} x2={x} y2={svgH - 20}
            stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,4" />
        ))}

        {/* Edges */}
        {edges.map((edge, i) => {
          const src = positions[edge.source];
          const tgt = positions[edge.target];
          if (!src || !tgt) return null;

          const srcType = nodes.find(n => n.id === edge.source)?.data?.nodeType || 'source';
          const sx = src.x + NODE_W, sy = src.y + NODE_H / 2;
          const tx = tgt.x,          ty = tgt.y + NODE_H / 2;

          const mid = (sx + tx) / 2;
          const path = `M ${sx},${sy} C ${mid},${sy} ${mid},${ty} ${tx},${ty}`;

          const stance  = edge.data?.stance || '';
          const color   = STANCE_COLORS[stance] || '#94a3b8';
          const markerId = STANCE_COLORS[stance] ? `kg-arrow-${stance}` : 'kg-arrow';

          return (
            <g key={i}>
              <path d={path} fill="none" stroke={color} strokeWidth="1.5"
                strokeOpacity="0.7" markerEnd={`url(#${markerId})`} />
              {edge.label && (
                <text x={mid} y={Math.min(sy, ty) - 5} textAnchor="middle"
                  fontSize="9" fill={color} fontWeight="600" fontFamily="monospace">
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const pos = positions[node.id];
          if (!pos) return null;
          const type   = node.data?.nodeType || node.type || 'source';
          const scheme = NODE_TYPE_COLOR[type] || NODE_TYPE_COLOR.source;
          const label  = node.data?.label || '';
          const url    = node.data?.url;
          const stance = node.data?.stance;
          const stanceColor = STANCE_COLORS[stance] || null;

          return (
            <g key={node.id}>
              {/* Card shadow */}
              <rect x={pos.x + 3} y={pos.y + 3} width={NODE_W} height={NODE_H}
                rx={4} fill="#0000001a" />
              {/* Card */}
              <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}
                rx={4} fill={scheme.bg} stroke={stanceColor || scheme.stroke} strokeWidth="1.5" />
              {/* Type badge */}
              <rect x={pos.x} y={pos.y} width={54} height={16} rx={3}
                fill={stanceColor || scheme.stroke} />
              <text x={pos.x + 5} y={pos.y + 11} fontSize="8" fill="#fff"
                fontWeight="700" fontFamily="monospace" letterSpacing="0.06em">
                {type.toUpperCase().slice(0, 7)}
              </text>
              {/* Label */}
              <text x={pos.x + 8} y={pos.y + 32} fontSize="11" fill={scheme.text}
                fontWeight="600" fontFamily="sans-serif">
                {label.length > 28 ? label.slice(0, 28) + '…' : label}
              </text>
              {/* URL line */}
              {url && (
                <text x={pos.x + 8} y={pos.y + 47} fontSize="8.5"
                  fill={scheme.stroke} fontFamily="monospace" opacity="0.8">
                  {url.replace(/^https?:\/\//, '').slice(0, 30)}…
                </text>
              )}
              {/* Stance dot */}
              {stanceColor && (
                <circle cx={pos.x + NODE_W - 10} cy={pos.y + 10} r={5} fill={stanceColor} />
              )}
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', flexWrap: 'wrap', padding: '0.5rem 0.25rem' }}>
        {[
          { color: '#16a34a', label: 'Supporting' },
          { color: '#dc2626', label: 'Contradicting' },
          { color: '#d97706', label: 'Contextual' },
          { color: '#64748b', label: 'Unclear' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#4a4a4a', fontFamily: 'monospace' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top 5 Links ───────────────────────────────────────────────────────────────
function TopLinks({ evidence }) {
  const top5 = (evidence || []).slice(0, 5);
  if (!top5.length) return (
    <div className="kg-empty">No sources retrieved.</div>
  );
  return (
    <div className="top-links-panel">
      <h3 className="panel-heading">📎 Top Sources</h3>
      <ol className="top-links-list">
        {top5.map((item, i) => {
          const stanceColor = STANCE_COLORS[item.stance?.toLowerCase()] || '#64748b';
          return (
            <li key={i} className="top-link-item">
              <div className="top-link-rank" style={{ color: stanceColor, borderColor: stanceColor }}>
                {i + 1}
              </div>
              <div className="top-link-body">
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="top-link-title">
                  {item.title || item.source_domain || 'Source'}
                </a>
                <div className="top-link-meta">
                  <span className="top-link-domain">{item.source_domain}</span>
                  {item.reliability_tier && (
                    <span className="top-link-tier" style={{
                      color: item.reliability_tier === 'HIGH' ? '#16a34a'
                           : item.reliability_tier === 'MEDIUM' ? '#d97706' : '#dc2626'
                    }}>[{item.reliability_tier}]</span>
                  )}
                  {item.stance && (
                    <span style={{ color: stanceColor, fontSize: '0.68rem', fontWeight: 800,
                      fontFamily: 'monospace', textTransform: 'uppercase' }}>
                      {item.stance}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Real PDF Download (jsPDF) ─────────────────────────────────────────────────
async function downloadPdf(claim, results) {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, margin = 16, textW = pageW - margin * 2;
  let y = 20;

  function line(text, opts = {}) {
    const { size = 11, bold = false, color = [30, 30, 30], wrap = true } = opts;
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    if (wrap) {
      const lines = doc.splitTextToSize(String(text ?? ''), textW);
      lines.forEach(l => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(l, margin, y);
        y += size * 0.45;
      });
    } else {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(String(text ?? ''), margin, y);
      y += size * 0.45;
    }
  }

  function gap(mm = 5) { y += mm; }

  function hline() {
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  }

  // ── Header ──
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('VAJRA AI  —  Fact Check Report', margin, 12);
  y = 26;

  line(`Generated: ${new Date().toLocaleString()}`, { size: 9, color: [120, 120, 120] });
  gap(4);

  // ── Claim ──
  hline();
  line('CLAIM', { size: 10, bold: true, color: [37, 99, 235] });
  gap(2);
  line(`"${claim}"`, { size: 12, bold: true });
  gap(5);

  // ── Verdict ──
  const verdict = (results?.verdict || 'UNKNOWN').toUpperCase().replace(/_/g, ' ');
  const confidence = results?.analysis_confidence ?? results?.confidence;
  hline();
  line('VERDICT', { size: 10, bold: true, color: [37, 99, 235] });
  gap(2);
  line(verdict, { size: 16, bold: true, color: [30, 30, 30] });
  if (confidence != null) {
    line(`Analysis Confidence: ${Math.round(confidence * 100)}%`, { size: 10, color: [80, 80, 80] });
  }
  gap(5);

  // ── Summary ──
  if (results?.summary) {
    hline();
    line('SUMMARY', { size: 10, bold: true, color: [37, 99, 235] });
    gap(2);
    line(results.summary, { size: 11 });
    gap(5);
  }

  // ── Top Sources ──
  const evidence = results?.evidence ?? [];
  const top5 = evidence.slice(0, 5);
  if (top5.length) {
    hline();
    line('TOP SOURCES', { size: 10, bold: true, color: [37, 99, 235] });
    gap(2);
    top5.forEach((e, i) => {
      line(`${i + 1}. ${e.title || e.source_domain || 'Source'}`, { size: 10, bold: true });
      if (e.url) line(`   ${e.url}`, { size: 9, color: [80, 80, 80] });
      const meta = [e.stance?.toUpperCase(), e.reliability_tier].filter(Boolean).join('  ·  ');
      if (meta) line(`   ${meta}`, { size: 9, color: [120, 120, 120] });
      gap(2);
    });
    gap(3);
  }

  // ── Reasoning ──
  if (results?.reasoning) {
    hline();
    line('REASONING', { size: 10, bold: true, color: [37, 99, 235] });
    gap(2);
    line(results.reasoning, { size: 10, color: [60, 60, 60] });
    gap(5);
  }

  // ── Limitations ──
  const limits = results?.limitations ?? [];
  if (limits.length) {
    hline();
    line('LIMITATIONS', { size: 10, bold: true, color: [37, 99, 235] });
    gap(2);
    limits.forEach(l => line(`• ${l}`, { size: 10, color: [80, 80, 80] }));
    gap(5);
  }

  // ── Footer ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`Powered by VAJRA AI  |  Page ${i} of ${pageCount}`, pageW / 2, 290, { align: 'center' });
  }

  doc.save(`vajra-report-${Date.now()}.pdf`);
}

// ── AI Image Result ───────────────────────────────────────────────────────────
function AIImageResult({ result }) {
  const v = VERDICT_META[result.verdict?.toLowerCase()] ?? {
    label: result.verdict, color: '#64748b', icon: '?',
  };
  return (
    <div className="ai-detect-card" style={{ borderColor: v.color }}>
      <div className="ai-detect-header">
        <span style={{ fontSize: '2.2rem' }}>{v.icon}</span>
        <div>
          <div className="ai-detect-verdict" style={{ color: v.color }}>{v.label}</div>
          <div className="ai-detect-confidence">
            Confidence: {Math.round((result.confidence || 0) * 100)}%
          </div>
        </div>
      </div>
      {result.summary && <p className="ai-detect-summary">{result.summary}</p>}
      {result.indicators?.length > 0 && (
        <div className="ai-detect-indicators">
          <strong>Detected Indicators:</strong>
          <ul>
            {result.indicators.map((ind, i) => <li key={i}>{ind}</li>)}
          </ul>
        </div>
      )}
      {result.limitations?.length > 0 && (
        <details className="ai-detect-limitations">
          <summary>Limitations ({result.limitations.length})</summary>
          <ul>
            {result.limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Main ResultsSection ───────────────────────────────────────────────────────
export default function ResultsSection({ claim, results, onReset, isAIDetection }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [downloading, setDownloading] = useState(false);

  const evidence    = results?.evidence ?? [];
  const verdict     = results?.verdict;
  const summary     = results?.summary;
  const confidence  = results?.analysis_confidence ?? results?.confidence;
  const reasoning   = results?.reasoning;
  const limitations = results?.limitations ?? [];
  const normalized  = results?.normalized_claim;
  const language    = results?.language;
  const graph       = results?.knowledge_graph;

  const tabs = isAIDetection
    ? []
    : ['summary', 'sources', 'graph', 'evidence'];

  async function handleDownload() {
    setDownloading(true);
    try { await downloadPdf(claim, results); }
    finally { setDownloading(false); }
  }

  return (
    <section className="results-section" aria-label="Verification results">
      {/* Header */}
      <div className="results-header">
        <div className="results-header-top">
          <h2 className="results-heading">
            {isAIDetection ? '🤖 AI Image Analysis' : '✓ Verification Complete'}
          </h2>
          <div className="results-header-actions">
            {!isAIDetection && (
              <button
                type="button"
                className="btn-download"
                onClick={handleDownload}
                disabled={downloading}
                title="Download PDF report"
              >
                {downloading ? '⏳ Generating…' : '⬇ Download PDF'}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onReset}>
              ← New Claim
            </button>
          </div>
        </div>
        <p className="results-claim mono">
          Claim: <strong>"{claim}"</strong>
        </p>
        {normalized && normalized !== claim && (
          <p className="results-translation-note">
            🌐 Translated from <strong>{language}</strong>: {normalized}
          </p>
        )}
      </div>

      {/* Verdict Banner */}
      <div className="verdict-banner" style={{
        borderColor: VERDICT_META[verdict?.toLowerCase()]?.color || '#64748b'
      }}>
        <VerdictBadge verdict={verdict} confidence={confidence} />
      </div>

      {/* AI Detection special view */}
      {isAIDetection && <AIImageResult result={results} />}

      {/* Tab navigation */}
      {!isAIDetection && (
        <>
          <div className="results-tabs" role="tablist">
            {tabs.map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`results-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'summary'  && '📋 Summary'}
                {tab === 'sources'  && `🔗 Top Sources (${Math.min(evidence.length, 5)})`}
                {tab === 'graph'    && '🕸 Knowledge Graph'}
                {tab === 'evidence' && `📁 All Evidence (${evidence.length})`}
              </button>
            ))}
          </div>

          <div className="results-tab-content">

            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div className="tab-panel">
                {summary && (
                  <div className="summary-card">
                    <h3 className="panel-heading">📋 Summary</h3>
                    <p className="summary-text">{summary}</p>
                  </div>
                )}
                {reasoning && (
                  <details className="reasoning-details">
                    <summary className="reasoning-summary">🔍 Full Reasoning ▾</summary>
                    <p className="reasoning-text">{reasoning}</p>
                  </details>
                )}
                {limitations.length > 0 && (
                  <details className="limitations-details">
                    <summary className="limitations-summary">⚠ Limitations ({limitations.length}) ▾</summary>
                    <ul className="limitations-list">
                      {limitations.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {/* Top Sources Tab */}
            {activeTab === 'sources' && (
              <div className="tab-panel">
                <TopLinks evidence={evidence} />
              </div>
            )}

            {/* Knowledge Graph Tab */}
            {activeTab === 'graph' && (
              <div className="tab-panel">
                <h3 className="panel-heading">🕸 Knowledge Graph</h3>
                <p className="panel-desc">Click any node to view details • Timeline shows claim history • Evidence Map shows source relationships</p>
                <KnowledgeGraph graph={graph} claim={claim} />
              </div>
            )}

            {/* All Evidence Tab */}
            {activeTab === 'evidence' && (
              <div className="tab-panel">
                <p className="results-summary">
                  {evidence.length} source{evidence.length !== 1 ? 's' : ''} — ranked by hybrid fusion (semantic + lexical)
                </p>
                <div className="evidence-grid">
                  {evidence.map(result => (
                    <EvidenceCard key={result.url ?? result.rank} result={result} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
