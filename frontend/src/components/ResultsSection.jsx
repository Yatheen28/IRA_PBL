import EvidenceCard from './EvidenceCard';
import './ResultsSection.css';

const VERDICT_LABELS = {
  true:            { label: 'TRUE',            color: '#22c55e' },
  false:           { label: 'FALSE',           color: '#ef4444' },
  misleading:      { label: 'MISLEADING',      color: '#f59e0b' },
  unverified:      { label: 'UNVERIFIED',      color: '#64748b' },
  partially_true:  { label: 'PARTIALLY TRUE',  color: '#3b82f6' },
};

function VerdictBadge({ verdict, confidence }) {
  const v = VERDICT_LABELS[verdict?.toLowerCase()] ?? {
    label: verdict?.toUpperCase() ?? 'UNKNOWN',
    color: '#64748b',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
      <span
        style={{
          background: v.color + '22',
          border: `1px solid ${v.color}`,
          color: v.color,
          padding: '0.3rem 0.9rem',
          borderRadius: '99px',
          fontWeight: 700,
          fontSize: '0.8rem',
          letterSpacing: '0.05em',
        }}
      >
        {v.label}
      </span>
      {confidence != null && (
        <span className="label-caps" style={{ color: 'var(--muted, #94a3b8)' }}>
          Confidence: {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  );
}

export default function ResultsSection({ claim, results, onReset }) {
  // results is now the full backend response object
  const evidence = results?.evidence ?? results?.results ?? [];
  const verdict  = results?.verdict;
  const summary  = results?.summary;
  const confidence = results?.analysis_confidence;
  const reasoning  = results?.reasoning;
  const limitations = results?.limitations ?? [];
  const normalized  = results?.normalized_claim;
  const language    = results?.language;

  return (
    <section className="results-section" aria-label="Verification results">
      <div className="results-header">
        <h2 className="results-heading">Verification Complete</h2>
        <p className="results-claim mono">
          For: <strong>"{claim}"</strong>
        </p>
        {normalized && normalized !== claim && (
          <p className="label-caps" style={{ color: 'var(--muted, #94a3b8)', marginTop: '0.25rem', fontSize: '0.75rem' }}>
            Translated ({language}): {normalized}
          </p>
        )}
      </div>

      {/* Verdict card */}
      {verdict && (
        <div className="window-card" style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem' }}>
          <VerdictBadge verdict={verdict} confidence={confidence} />
          {summary && <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', lineHeight: 1.6 }}>{summary}</p>}
          {reasoning && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>
                View full reasoning ▾
              </summary>
              <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', whiteSpace: 'pre-wrap', color: 'var(--muted, #94a3b8)' }}>
                {reasoning}
              </p>
            </details>
          )}
          {limitations.length > 0 && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>
                Limitations ({limitations.length}) ▾
              </summary>
              <ul style={{ marginTop: '0.4rem', paddingLeft: '1.2rem', fontSize: '0.78rem', color: 'var(--muted, #94a3b8)' }}>
                {limitations.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      <p className="results-summary label-caps">
        {evidence.length} source{evidence.length !== 1 ? 's' : ''} retrieved — ranked by semantic relevance
      </p>

      <div className="evidence-grid">
        {evidence.map((result) => (
          <EvidenceCard key={result.url ?? result.rank} result={result} />
        ))}
      </div>

      <div className="results-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onReset}
        >
          Verify Another Claim
        </button>
      </div>
    </section>
  );
}
