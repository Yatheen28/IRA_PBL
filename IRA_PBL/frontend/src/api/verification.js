import { API_BASE } from '../utils/constants';

/**
 * Send a claim to the VAJRA backend for verification.
 * @param {string} claim - The claim text to verify.
 * @returns {Promise<{claim: string, results: Array}>} The verification response.
 */
export async function verifyClaim(claim) {
  const response = await fetch(`${API_BASE}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim }),
  });

  if (!response.ok) {
    const status = response.status;
    let message = `Backend returned status ${status}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) message = errorData.detail;
    } catch {
      // Response body wasn't JSON
    }
    throw new Error(message);
  }

  return response.json();
}
