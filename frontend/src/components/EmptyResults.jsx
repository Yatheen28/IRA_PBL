export default function EmptyResults({ claim, onReset }) {
  return (
    <div className="error-container" role="status">
      <div className="window-card" style={{ maxWidth: 480, width: '100%' }}>
        <div className="window-titlebar">
          <div className="window-dots"><span /><span /></div>
          <span>NO RESULTS</span>
        </div>
        <div className="window-content" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
          <p className="mono" style={{ fontSize: 14, fontWeight: 500 }}>
            No evidence was retrieved for this claim.
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            This does not mean the claim is true or false. VAJRA could not find relevant web sources for: <strong>"{claim}"</strong>
          </p>
          <button type="button" className="btn btn-secondary" onClick={onReset}>
            Try Another Claim
          </button>
        </div>
      </div>
    </div>
  );
}
