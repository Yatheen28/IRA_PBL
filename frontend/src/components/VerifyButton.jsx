export default function VerifyButton({ onClick, disabled, loading }) {
  return (
    <button
      type="button"
      className="btn btn-primary verify-btn"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label="Verify claim"
      style={{
        width: '100%',
        padding: '14px 24px',
        fontSize: '16px',
        letterSpacing: '0.1em',
        marginTop: '8px',
      }}
    >
      {loading ? 'VERIFYING...' : 'VERIFY →'}
    </button>
  );
}
