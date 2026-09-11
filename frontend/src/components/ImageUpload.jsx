import { useRef } from 'react';
import './ImageUpload.css';

export default function ImageUpload({ image, onSelect, onRemove, disabled }) {
  const fileRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onSelect(file);
    }
    e.target.value = '';
  };

  if (image) {
    return (
      <div className="image-preview-container">
        <div className="window-card image-preview-card">
          <div className="window-titlebar">
            <div className="window-dots"><span /><span /></div>
            <span>{image.name}</span>
          </div>
          <div className="image-preview-content">
            <img
              src={URL.createObjectURL(image)}
              alt="Selected claim image"
              className="image-preview-img"
            />
            <p className="image-notice mono">
              Image verification coming soon. Text claims only for now.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onRemove}
              disabled={disabled}
            >
              Remove image
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="image-upload-zone">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        disabled={disabled}
        className="visually-hidden"
        id="image-upload"
        aria-label="Upload image for verification"
      />
      <label htmlFor="image-upload" className="image-upload-label mono">
        <span className="image-upload-icon">+</span>
        Upload Image (JPG, PNG)
      </label>
    </div>
  );
}
