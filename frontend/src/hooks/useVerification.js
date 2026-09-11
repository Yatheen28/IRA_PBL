import { useState, useCallback } from 'react';
import { verifyClaim } from '../api/verification';

/**
 * Custom hook managing the verification workflow state machine.
 * States: idle | loading | success | error | empty
 */
export function useVerification() {
  const [state, setState] = useState('idle');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [submittedClaim, setSubmittedClaim] = useState('');

  const verify = useCallback(async (claim) => {
    if (!claim.trim()) return;

    setState('loading');
    setError(null);
    setResults(null);
    setSubmittedClaim(claim.trim());

    try {
      const data = await verifyClaim(claim.trim());

      if (!data.results || data.results.length === 0) {
        setState('empty');
        setResults([]);
      } else {
        setState('success');
        setResults(data.results);
      }
    } catch (err) {
      setState('error');
      setError(err.message || 'Unable to retrieve evidence from VAJRA.');
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setResults(null);
    setError(null);
    setSubmittedClaim('');
  }, []);

  return {
    state,
    results,
    error,
    submittedClaim,
    verify,
    reset,
  };
}
