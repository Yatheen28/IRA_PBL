import { useState } from 'react';
import { useVerification } from './hooks/useVerification';
import Header from './components/Header';
import ClaimInput from './components/ClaimInput';
import ImageUpload from './components/ImageUpload';
import VerifyButton from './components/VerifyButton';
import LoadingState from './components/LoadingState';
import ResultsSection from './components/ResultsSection';
import ErrorState from './components/ErrorState';
import EmptyResults from './components/EmptyResults';
import Footer from './components/Footer';
import './App.css';

export default function App() {
  const [claim, setClaim] = useState('');
  const [image, setImage] = useState(null);
  const { state, results, error, submittedClaim, verify, reset } = useVerification();

  const isLoading = state === 'loading';

  const handleVerify = () => {
    if (claim.trim()) {
      verify(claim);
    }
  };

  const handleReset = () => {
    setClaim('');
    setImage(null);
    reset();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey && claim.trim() && !isLoading) {
      handleVerify();
    }
  };

  return (
    <div className="app" onKeyDown={handleKeyDown}>
      <Header />

      <main className="main container" role="main">
        {/* Verification Input — shown only in idle state */}
        {(state === 'idle') && (
          <section className="verify-section" aria-label="Claim verification input">
            <h2 className="verify-heading">
              What claim do you want to verify?
            </h2>

            <div className="verify-form">
              <ClaimInput
                value={claim}
                onChange={setClaim}
                onClear={() => setClaim('')}
                disabled={isLoading}
              />

              <ImageUpload
                image={image}
                onSelect={setImage}
                onRemove={() => setImage(null)}
                disabled={isLoading}
              />

              <VerifyButton
                onClick={handleVerify}
                disabled={!claim.trim()}
                loading={isLoading}
              />

              <p className="verify-hint mono">
                Press Ctrl+Enter to verify
              </p>
            </div>
          </section>
        )}

        {/* Loading State */}
        {state === 'loading' && <LoadingState />}

        {/* Success — Results */}
        {state === 'success' && results && (
          <ResultsSection
            claim={submittedClaim}
            results={results}
            onReset={handleReset}
          />
        )}

        {/* Error State */}
        {state === 'error' && (
          <ErrorState
            message={error}
            onRetry={() => verify(submittedClaim)}
          />
        )}

        {/* Empty Results */}
        {state === 'empty' && (
          <EmptyResults
            claim={submittedClaim}
            onReset={handleReset}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
