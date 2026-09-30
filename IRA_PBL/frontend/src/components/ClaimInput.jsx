import { useState } from 'react';
import { MAX_CLAIM_LENGTH } from '../utils/constants';
import './ClaimInput.css';

export default function ClaimInput({ value, onChange, onClear, disabled }) {
  return (
    <div className="claim-input-wrapper">
      <label htmlFor="claim-input" className="label-caps">
        Enter claim to verify
      </label>
      <div className="claim-textarea-container">
        <textarea
          id="claim-input"
          className="claim-textarea mono"
          value={value}
          onChange={(e) => {
            if (e.target.value.length <= MAX_CLAIM_LENGTH) {
              onChange(e.target.value);
            }
          }}
          placeholder="e.g., 'The Earth is flat' or '5G towers cause coronavirus'"
          rows={4}
          maxLength={MAX_CLAIM_LENGTH}
          disabled={disabled}
          aria-describedby="char-counter"
        />
      </div>
      <div className="claim-controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClear}
          disabled={!value || disabled}
          aria-label="Clear claim input"
        >
          Clear
        </button>
        <span id="char-counter" className="char-counter mono" aria-live="polite">
          {value.length}/{MAX_CLAIM_LENGTH}
        </span>
      </div>
    </div>
  );
}
