import './EvidenceCard.css';

const STANCE_COLORS = {
  supporting:    '#22c55e',
  contradicting: '#ef4444',
  contextual:    '#3b82f6',
  unclear:       '#64748b',
};

export default function EvidenceCard({ result }) {
  const {
    rank, title, url, content,
    search_score, semantic_score, lexical_score, fusion_score,
    source_reliability_score, combined_score, stance,
    source_domain, source_type, reliability_tier,
  } = result;

  const domain = source_domain ?? (() => {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return url; }
  })();

  const stanceColor = STANCE_COLORS[stance?.toLowerCase()] ?? '#64748b';

  return (
    <article className="window-card evidence-card" aria-label={`Evidence source ${rank}`}>
      <div className="window-titlebar">
        <div className="window-dots"><span /><span /></div>
        <span>EVIDENCE #{String(rank).padStart(2, '0')}</span>
        
        {source_type && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: '#a855f7',
            border: '1px solid #a855f7',
            borderRadius: '4px',
            padding: '0.1rem 0.4rem',
            marginRight: '0.5rem',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
          }}>
            {source_type.toUpperCase()}
          </span>
        )}

        {stance && (
          <span style={{
            marginLeft: source_type ? '0' : 'auto',
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            color: stanceColor,
            border: `1px solid ${stanceColor}`,
            borderRadius: '99px',
            padding: '0 0.5rem',
          }}>
            {stance.toUpperCase()}
          </span>
        )}
      </div>
      <div className="window-content evidence-content">
        <div className="evidence-scores">
          {semantic_score != null && (
            <div className="score-item">
              <span className="label-caps">Semantic</span>
              <span className="data-value">{semantic_score?.toFixed(2)}</span>
            </div>
          )}
          {lexical_score != null && (
            <div className="score-item">
              <span className="label-caps">Lexical</span>
              <span className="data-value">{lexical_score?.toFixed(2)}</span>
            </div>
          )}
          {fusion_score != null && (
            <div className="score-item">
              <span className="label-caps">Fusion (RRF)</span>
              <span className="data-value">{fusion_score?.toFixed(4)}</span>
            </div>
          )}
          {source_reliability_score != null && (
            <div className="score-item">
              <span className="label-caps">Reliability</span>
              <span className="data-value">{source_reliability_score?.toFixed(2)}</span>
            </div>
          )}
          {combined_score != null && (
            <div className="score-item" style={{backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '0 4px', borderRadius: '4px'}}>
              <span className="label-caps" style={{color: '#fff'}}>Combined</span>
              <span className="data-value" style={{fontWeight: '700'}}>{combined_score?.toFixed(2)}</span>
            </div>
          )}
        </div>

        <h3 className="evidence-title">{title || 'Untitled Source'}</h3>

        <p className="evidence-snippet">
          {content
            ? content.length > 300
              ? content.slice(0, 300) + '...'
              : content
            : 'No content snippet available.'}
        </p>

        <div className="evidence-footer">
          <span className="evidence-source mono">
            {domain}{source_type ? ` · ${source_type}` : ''}
            {reliability_tier && (
              <span style={{
                marginLeft: '0.5rem',
                fontSize: '0.6rem',
                fontWeight: 700,
                color: reliability_tier === 'HIGH' ? '#22c55e'
                     : reliability_tier === 'MEDIUM' ? '#f59e0b'
                     : reliability_tier === 'LOW' ? '#ef4444'
                     : '#64748b',
                opacity: 0.9,
              }}>
                [{reliability_tier}]
              </span>
            )}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="evidence-link mono"
            aria-label={`Read full article from ${domain}`}
          >
            Read article ↗
          </a>
        </div>
      </div>
    </article>
  );
}
