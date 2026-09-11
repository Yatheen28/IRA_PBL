import { useState } from 'react'
import { ArrowLeft, AlertTriangle, Globe, CheckCircle2, XCircle, HelpCircle, Network } from 'lucide-react'
import type { VerifyResponse } from '../services/api'
import { VerdictBadge } from '../components/VerdictBadge'
import { EvidenceCard } from '../components/EvidenceCard'
import { KnowledgeGraph } from '../components/KnowledgeGraph'

interface ResultsProps {
  result: VerifyResponse
  onBack: () => void
}

type Tab = 'all' | 'supporting' | 'contradicting' | 'contextual'

export function Results({ result, onBack }: ResultsProps) {
  const [tab, setTab] = useState<Tab>('all')
  const [showGraph, setShowGraph] = useState(false)

  const filteredEvidence = result.evidence.filter(e => {
    if (tab === 'all') return true
    return e.stance === tab
  })

  const counts = {
    supporting:    result.evidence.filter(e => e.stance === 'supporting').length,
    contradicting: result.evidence.filter(e => e.stance === 'contradicting').length,
    contextual:    result.evidence.filter(e => e.stance === 'contextual' || e.stance === 'unclear').length,
  }

  const tabs: { key: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
    { key: 'all',           label: 'All Evidence',    count: result.evidence.length, icon: <Globe size={12} /> },
    { key: 'supporting',    label: 'Supporting',      count: counts.supporting,      icon: <CheckCircle2 size={12} /> },
    { key: 'contradicting', label: 'Contradicting',   count: counts.contradicting,   icon: <XCircle size={12} /> },
    { key: 'contextual',    label: 'Contextual',      count: counts.contextual,      icon: <HelpCircle size={12} /> },
  ]

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 px-6 py-4 border-b border-slate-800"
        style={{ background: 'rgba(10,15,30,0.9)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={16} />
            New Verification
          </button>
          <span className="text-xs text-slate-500 font-medium">VAJRA AI</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Claim */}
        <div className="glass p-6">
          <p className="text-xs text-slate-500 mb-2">Claim verified</p>
          <p className="text-lg font-medium text-slate-100 leading-snug mb-1">
            {result.original_claim}
          </p>
          {result.original_claim !== result.normalized_claim && (
            <p className="text-xs text-slate-500 mt-2">
              <span className="text-blue-400">Translated:</span> {result.normalized_claim}
              {' '}· Language detected: <span className="font-mono">{result.language}</span>
            </p>
          )}
        </div>

        {/* Verdict */}
        <div className="glass p-6 space-y-4">
          <VerdictBadge verdict={result.verdict} confidence={result.analysis_confidence} />
          <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>

          {result.reasoning && (
            <details className="text-xs text-slate-400 leading-relaxed">
              <summary className="cursor-pointer text-blue-400 hover:text-blue-300 text-sm font-medium">
                View full reasoning
              </summary>
              <p className="mt-3 p-4 rounded-xl bg-slate-800/50 whitespace-pre-wrap">
                {result.reasoning}
              </p>
            </details>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2 pt-3 border-t border-slate-700 text-xs text-slate-500">
            <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-500" />
            <span>
              <strong className="text-amber-400">Important:</strong>{' '}
              Semantic relevance scores measure topical similarity — not truthfulness.
              Source reliability scores are domain heuristics, not truth guarantees.
              Analysis confidence is not a calibrated statistical probability.
            </span>
          </div>
        </div>

        {/* Evidence tabs */}
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
                style={{
                  background: tab === t.key ? 'var(--accent)' : 'var(--bg-card)',
                  color: tab === t.key ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${tab === t.key ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {t.icon}
                {t.label}
                {t.count !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs"
                    style={{ background: tab === t.key ? 'rgba(255,255,255,0.2)' : 'var(--bg-secondary)' }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {filteredEvidence.length === 0 ? (
            <div className="glass p-8 text-center text-slate-500 text-sm">
              No {tab} evidence found.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredEvidence.map(e => <EvidenceCard key={e.url} item={e} />)}
            </div>
          )}
        </div>

        {/* Knowledge Graph */}
        <div className="glass overflow-hidden">
          <button
            onClick={() => setShowGraph(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Network size={16} className="text-blue-400" />
              Knowledge Graph
            </div>
            <span className="text-slate-500 text-xs">{showGraph ? 'Hide' : 'Show'}</span>
          </button>
          {showGraph && (
            <div className="px-4 pb-4">
              <KnowledgeGraph
                nodes={result.knowledge_graph.nodes}
                edges={result.knowledge_graph.edges}
              />
              <p className="text-xs text-slate-600 mt-2 text-center">
                Only relationships derived from retrieved evidence are shown.
              </p>
            </div>
          )}
        </div>

        {/* Limitations */}
        {result.limitations.length > 0 && (
          <div className="glass p-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Limitations
            </h3>
            <ul className="space-y-1">
              {result.limitations.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                  <span className="text-slate-600 mt-0.5">•</span>
                  {l}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
