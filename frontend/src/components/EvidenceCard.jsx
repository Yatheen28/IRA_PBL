import './EvidenceCard.css';

export default function EvidenceCard({ result }) {
  const { rank, title, url, content, search_score, semantic_score } = result;

  const domain = (() => {
    try { return new URL(url).hostname.replace('www.', ''); }
    catch { return url; }
  })();

  return (
    <article className="window-card evidence-card" aria-label={`Evidence source ${rank}`}>
      <div className="window-titlebar">
        <div className="window-dots"><span /><span /></div>
        <span>EVIDENCE #{String(rank).padStart(2, '0')}</span>
      </div>
      <div className="window-content evidence-content">
        <div className="evidence-scores">
          <div className="score-item">
            <span className="label-caps">Semantic Relevance</span>
            <span className="data-value">{semantic_score?.toFixed(2) ?? '—'}</span>
          </div>
          <div className="score-item">
            <span className="label-caps">Search Score</span>
            <span className="data-value">{search_score?.toFixed(2) ?? '—'}</span>
          </div>
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
          <span className="evidence-source mono">{domain}</span>
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
