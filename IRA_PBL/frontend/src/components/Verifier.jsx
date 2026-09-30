import { useState } from 'react';
import { useVerification } from '../hooks/useVerification';
import ClaimInput from './ClaimInput';
import ImageUpload from './ImageUpload';
import VerifyButton from './VerifyButton';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import EmptyResults from './EmptyResults';
import ResultsSection from './ResultsSection';
import { API_BASE } from '../utils/constants';

export default function Verifier() {
  const { state, results, error, submittedClaim, verify, reset } = useVerification();
  const [claim, setClaim] = useState('');
  const [image, setImage] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageMode, setImageMode] = useState('ocr'); // 'ocr' | 'ai-detect'
  const [imageResult, setImageResult] = useState(null);
  const [isAIDetection, setIsAIDetection] = useState(false);

  const loading = state === 'loading' || imageLoading;

  async function handleVerify() {
    if (image) {
      setImageLoading(true);
      setImageError('');
      setIsAIDetection(imageMode === 'ai-detect');
      try {
        const form = new FormData();
        form.append('image', image);
        const endpoint = imageMode === 'ai-detect'
          ? `${API_BASE}/verify/image/ai-detect`
          : `${API_BASE}/verify/image`;
        const response = await fetch(endpoint, { method: 'POST', body: form });
        if (!response.ok) {
          let message = `Backend returned status ${response.status}`;
          try {
            const data = await response.json();
            if (data.detail) message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
          } catch { /* not json */ }
          throw new Error(message);
        }
        const data = await response.json();
        setImageResult(data);
      } catch (err) {
        setImageError(err.message || 'Image verification failed.');
      } finally {
        setImageLoading(false);
      }
      return;
    }
    if (claim.trim()) {
      verify(claim);
    }
  }

  function handleReset() {
    reset();
    setClaim('');
    setImage(null);
    setImageError('');
    setImageResult(null);
    setIsAIDetection(false);
  }

  const activeResults = imageResult || results;
  const activeState   = imageResult ? 'success' : state;
  const activeClaim   = imageResult
    ? (imageResult.original_claim || image?.name || 'Image')
    : submittedClaim;
  const activeIsAI    = imageResult ? isAIDetection : false;

  return (
    <main id="main-content" className="main container">
      <section className="verify-section" aria-label="Claim verification">
        {activeState === 'success' && activeResults ? (
          <ResultsSection
            claim={activeClaim}
            results={activeResults}
            onReset={handleReset}
            isAIDetection={activeIsAI}
          />
        ) : (
          <>
            <h1 className="verify-heading">Enter a claim to verify.</h1>
            <div className="verify-form">
              <ClaimInput
                value={claim}
                onChange={setClaim}
                onClear={() => setClaim('')}
                disabled={loading}
              />
              <ImageUpload
                image={image}
                onSelect={setImage}
                onRemove={() => { setImage(null); setImageError(''); }}
                disabled={loading}
              />

              {/* Image mode toggle — only show when an image is selected */}
              {image && (
                <div className="image-mode-selector">
                  <span className="image-mode-label">Image analysis mode:</span>
                  <div className="image-mode-options">
                    <label className={`image-mode-option ${imageMode === 'ocr' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="imageMode"
                        value="ocr"
                        checked={imageMode === 'ocr'}
                        onChange={() => setImageMode('ocr')}
                        disabled={loading}
                      />
                      <span className="mode-icon">📝</span>
                      <span>
                        <strong>Extract & Verify</strong>
                        <small>OCR text → fact-check pipeline</small>
                      </span>
                    </label>
                    <label className={`image-mode-option ${imageMode === 'ai-detect' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="imageMode"
                        value="ai-detect"
                        checked={imageMode === 'ai-detect'}
                        onChange={() => setImageMode('ai-detect')}
                        disabled={loading}
                      />
                      <span className="mode-icon">🤖</span>
                      <span>
                        <strong>AI Detection</strong>
                        <small>Check if image is AI-generated</small>
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <VerifyButton
                onClick={handleVerify}
                disabled={!claim.trim() && !image}
                loading={loading}
              />
              {imageError && (
                <p className="verify-hint" style={{ color: 'var(--color-error)' }}>
                  {imageError}
                </p>
              )}
              <p className="verify-hint mono">
                VAJRA retrieves evidence, ranks sources, and produces a grounded verdict.
                Supports text claims and image analysis (OCR or AI detection).
              </p>
            </div>
            {activeState === 'loading' && <LoadingState />}
            {activeState === 'error'   && <ErrorState message={error} onRetry={() => verify(claim)} />}
            {activeState === 'empty'   && <EmptyResults claim={submittedClaim} onReset={handleReset} />}
          </>
        )}
      </section>
    </main>
  );
}
