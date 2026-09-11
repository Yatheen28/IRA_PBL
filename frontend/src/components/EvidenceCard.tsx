import { ExternalLink, Shield, BarChart3 } from 'lucide-react'
import type { EvidenceItem } from '../services/api'
import { ScoreBar } from './ScoreBar'

const STANCE_CONFIG: Record<string, { label: string; color: string }> = {
  supporting:    { label: 'Supporting',    color: '#22c55e' },
  contradicting: { label: 'Contradicting', color: '#ef4444' },
  contextual:    { label: 'Contextual',    color: '#f59e0b' },
  unclear:       { label: 'Unclear',       color: '#94a3b8' },
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  government:             'Government',
  international_authority:'International Authority',
  scientific_medical:     'Scientific / Medical',
  fact_checking:          'Fact Checking',
  academic_research:      'Academic Research',
  established_news:       'Established News',
  reference:              'Reference',
  general_web:            'General Web',
  user_generated:         'User Generated',
  unknown:                'Unknown',
}

interface EvidenceCardProps {
  item: EvidenceItem
}

export function EvidenceCard({ item }: EvidenceCardProps) {
  const stance = STANCE_CONFIG[item.stance] ?? STANCE_CONFIG.unclear

  return (
    <div className="glass p-5 transition-all duration-200 fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
            #{item.rank}
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              color: stance.color,
              background: `${stance.color}18`,
              border: `1px solid ${stance.color}40`,
            }}
          >
            {stance.label}
          </span>
          <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full bg-slate-800">
            {SOURCE_TYPE_LABELS[item.source_type] ?? item.source_type}
          </span>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-slate-200 mb-1 leading-snug">
        {item.title || '(No title)'}
      </h3>
      <p className="font-mono text-xs text-slate-500 mb-3 truncate">{item.source_domain}</p>

      {/* Content excerpt */}
      <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-3">
        {item.content}
      </p>

      {/* Scores */}
      <div className="space-y-2 pt-3 border-t border-slate-700">
        <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
          <BarChart3 size={10} />
          <span>Scores (not truth probabilities)</span>
        </div>
        <ScoreBar value={item.semantic_score}           color="#3b82f6" label="Semantic relevance" />
        <ScoreBar value={item.source_reliability_score} color="#8b5cf6" label="Source reliability" />
        <ScoreBar value={item.combined_score}           color="#06b6d4" label="Combined rank score" />
      </div>

      {/* Reliability reason */}
      <div className="flex items-start gap-2 mt-3 text-xs text-slate-500">
        <Shield size={10} className="shrink-0 mt-0.5" />
        <span>{item.reliability_reason}</span>
      </div>
    </div>
  )
}
