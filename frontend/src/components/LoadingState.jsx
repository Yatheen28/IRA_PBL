import './LoadingState.css';

export default function LoadingState() {
  return (
    <div className="loading-container" role="status" aria-live="polite">
      <div className="window-card loading-card">
        <div className="window-titlebar">
          <div className="window-dots"><span /><span /></div>
          <span>PROCESSING</span>
        </div>
        <div className="window-content loading-content">
          <p className="loading-text mono">Retrieving evidence...</p>
          <div className="loading-bar" aria-hidden="true">
            <div className="loading-bar-fill" />
          </div>
          <p className="loading-sub">Searching web sources and ranking by semantic relevance</p>
        </div>
      </div>
    </div>
  );
}
