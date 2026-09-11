const VERDICT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  TRUE:                   { label: 'TRUE',                 color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)' },
  FALSE:                  { label: 'FALSE',                color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)' },
  PARTIALLY_TRUE:         { label: 'PARTIALLY TRUE',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)' },
  MISLEADING:             { label: 'MISLEADING',           color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)' },
  INSUFFICIENT_EVIDENCE:  { label: 'INSUFFICIENT EVIDENCE',color: '#6366f1', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)' },
  CONFLICTING_EVIDENCE:   { label: 'CONFLICTING EVIDENCE', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.3)' },
}

interface VerdictBadgeProps {
  verdict: string
  confidence: number
}

export function VerdictBadge({ verdict, confidence }: VerdictBadgeProps) {
  const cfg = VERDICT_CONFIG[verdict] ?? { label: verdict, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)' }
  return (
    <div
      className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl text-sm font-semibold tracking-wide"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      <span className="text-xl font-bold">{cfg.label}</span>
      <span
        className="text-xs font-normal px-2 py-1 rounded-full"
        style={{ background: cfg.border, color: cfg.color }}
        title="Analysis confidence — NOT a truth probability"
      >
        {Math.round(confidence * 100)}% confidence
      </span>
    </div>
  )
}

export { VERDICT_CONFIG }
