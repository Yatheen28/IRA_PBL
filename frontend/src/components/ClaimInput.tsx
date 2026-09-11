import { useState, useRef, type DragEvent } from 'react'
import { Search, Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'

interface ClaimInputProps {
  onSubmitText: (claim: string) => void
  onSubmitImage: (file: File) => void
  loading: boolean
}

export function ClaimInput({ onSubmitText, onSubmitImage, loading }: ClaimInputProps) {
  const [claim, setClaim] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (claim.trim() && !loading) onSubmitText(claim.trim())
  }

  const handleFile = (file: File) => {
    if (file.type.startsWith('image/')) {
      setSelectedFile(file)
      setClaim('')
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImageSubmit = () => {
    if (selectedFile && !loading) onSubmitImage(selectedFile)
  }

  return (
    <div className="space-y-4">
      {/* Text input */}
      <form onSubmit={handleTextSubmit}>
        <div className="relative">
          <textarea
            value={claim}
            onChange={e => { setClaim(e.target.value); setSelectedFile(null) }}
            placeholder="Enter a claim to verify — e.g. '5G towers cause coronavirus'"
            rows={3}
            disabled={loading}
            className="w-full rounded-2xl px-5 py-4 pr-14 text-sm resize-none outline-none transition-all duration-200"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'Inter, sans-serif',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
          <button
            type="submit"
            disabled={!claim.trim() || loading}
            className="absolute right-3 bottom-3 p-2.5 rounded-xl transition-all duration-200 disabled:opacity-30"
            style={{ background: claim.trim() ? 'var(--accent)' : 'var(--border)' }}
          >
            {loading ? (
              <Loader2 size={16} className="text-white animate-spin" />
            ) : (
              <Search size={16} className="text-white" />
            )}
          </button>
        </div>
      </form>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <div className="flex-1 h-px bg-slate-800" />
        <span>or upload an image</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* Image upload */}
      <div
        className="relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer"
        style={{
          borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
          background: dragOver ? 'var(--accent-glow)' : 'transparent',
          padding: selectedFile ? '12px 16px' : '24px',
        }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !selectedFile && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {selectedFile ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className="text-blue-400" />
              <span className="text-sm text-slate-300">{selectedFile.name}</span>
              <span className="text-xs text-slate-500">
                ({(selectedFile.size / 1024).toFixed(0)} KB)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleImageSubmit}
                disabled={loading}
                className="px-4 py-1.5 rounded-xl text-xs font-medium text-white transition-all disabled:opacity-30"
                style={{ background: 'var(--accent)' }}
              >
                {loading ? 'Verifying…' : 'Verify Image'}
              </button>
              <button
                onClick={e => { e.stopPropagation(); setSelectedFile(null) }}
                className="p-1 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X size={14} className="text-slate-400" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload size={20} className="text-slate-500" />
            <p className="text-sm text-slate-400">
              Drag & drop or <span className="text-blue-400">click to upload</span>
            </p>
            <p className="text-xs text-slate-600">PNG, JPG, JPEG, WEBP</p>
          </div>
        )}
      </div>
    </div>
  )
}
