import { useState } from 'react'
import { Shield, Zap, Globe, BarChart3 } from 'lucide-react'
import { ClaimInput } from '../components/ClaimInput'
import { verifyClaim, verifyImage, type VerifyResponse } from '../services/api'

interface HomeProps {
  onResult: (result: VerifyResponse) => void
}

const EXAMPLE_CLAIMS = [
  '5G towers cause coronavirus',
  'The Earth is flat',
  'Vaccines contain microchips',
  'Water boils at 100°C at sea level',
]

export function Home({ onResult }: HomeProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (fn: () => Promise<VerifyResponse>) => {
    setError(null)
    setLoading(true)
    try {
      const result = await fn()
      onResult(result)
    } catch (e: any) {
      setError(e.message ?? 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 border-b border-slate-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">VAJRA AI</h1>
              <p className="text-xs text-slate-500">Verify Before You Share</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
              v0.3.0
            </span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          {/* Title */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6"
              style={{ background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd' }}>
              <Zap size={12} />
              AI-Powered Misinformation Detection
            </div>
            <h2 className="text-4xl font-bold tracking-tight mb-3">
              Verify any claim with{' '}
              <span style={{ color: 'var(--accent)' }}>real evidence</span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed">
              VAJRA retrieves live web evidence, ranks it semantically, and
              uses Gemini AI to produce a grounded, explainable verdict —
              without hallucinating facts.
            </p>
          </div>

          {/* Input */}
          <div className="glass p-6 mb-6">
            <ClaimInput
              onSubmitText={(c) => submit(() => verifyClaim(c))}
              onSubmitImage={(f) => submit(() => verifyImage(f))}
              loading={loading}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl text-sm text-red-300 border border-red-500/30 bg-red-500/10">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8 text-slate-400">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-t-blue-500 animate-spin" />
              </div>
              <p className="text-sm">Retrieving and analysing evidence…</p>
              <p className="text-xs text-slate-600">This may take 10–20 seconds</p>
            </div>
          )}

          {/* Examples */}
          {!loading && (
            <div>
              <p className="text-xs text-slate-500 mb-3 text-center">Try an example</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {EXAMPLE_CLAIMS.map((c) => (
                  <button
                    key={c}
                    onClick={() => submit(() => verifyClaim(c))}
                    className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 hover:scale-105"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="w-full max-w-4xl mt-20 grid grid-cols-3 gap-5">
          {[
            { icon: <Globe size={18} />, title: 'Live Evidence', desc: 'Real-time web retrieval via Tavily Search' },
            { icon: <BarChart3 size={18} />, title: 'Semantic Ranking', desc: 'BGE embeddings + cosine similarity scoring' },
            { icon: <Shield size={18} />, title: 'Grounded Verdict', desc: 'Gemini analyses only retrieved evidence' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="glass p-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 text-blue-400"
                style={{ background: 'var(--accent-glow)' }}>
                {icon}
              </div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">{title}</h3>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
