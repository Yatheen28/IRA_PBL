import EvidenceCard from './EvidenceCard';
import './ResultsSection.css';

export default function ResultsSection({ claim, results, onReset }) {
  return (
    <section className="results-section" aria-label="Verification results">
      <div className="results-header">
        <h2 className="results-heading">Evidence Retrieved</h2>
        <p className="results-claim mono">
          For: <strong>"{claim}"</strong>
        </p>
        <p className="results-summary label-caps">
          {results.length} source{results.length !== 1 ? 's' : ''} retrieved — ranked by semantic relevance
        </p>
      </div>

      <div className="evidence-grid">
        {results.map((result) => (
          <EvidenceCard key={result.rank} result={result} />
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
