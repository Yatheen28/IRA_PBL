import './ErrorState.css';

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="error-container" role="alert">
      <div className="window-card error-card">
        <div className="window-titlebar error-titlebar">
          <div className="window-dots"><span /><span /></div>
          <span>CONNECTION ERROR</span>
        </div>
        <div className="window-content error-content">
          <p className="error-message mono">{message}</p>
          <p className="error-hint">
            Check that the backend is running at <code className="mono">localhost:8000</code>
          </p>
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
