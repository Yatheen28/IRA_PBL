interface ScoreBarProps {
  value: number
  color: string
  label: string
}

export function ScoreBar({ value, color, label }: ScoreBarProps) {
  const pct = Math.round(value * 100)
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-400 w-32 shrink-0 text-xs">{label}</span>
      <div className="score-bar-track flex-1">
        <div
          className="score-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-slate-300 font-mono text-xs w-8 text-right">{pct}%</span>
    </div>
  )
}
