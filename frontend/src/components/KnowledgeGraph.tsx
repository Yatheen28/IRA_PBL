
import { ReactFlow, Background, Controls, MiniMap, BackgroundVariant } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphNode, GraphEdge } from '../services/api'

interface KnowledgeGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const NODE_COLORS: Record<string, string> = {
  claim:   '#3b82f6',
  verdict: '#8b5cf6',
  evidence:'#06b6d4',
  source:  '#6366f1',
}

export function KnowledgeGraph({ nodes, edges }: KnowledgeGraphProps) {
  if (!nodes.length) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        No graph data available
      </div>
    )
  }

  const styledNodes = nodes.map((n) => ({
    ...n,
    style: {
      background: NODE_COLORS[n.type] ?? '#475569',
      color: '#fff',
      border: 'none',
      borderRadius: '10px',
      fontSize: '11px',
      padding: '8px 12px',
      maxWidth: '160px',
      wordBreak: 'break-word' as const,
    },
  }))

  return (
    <div style={{ height: 420, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <ReactFlow
        nodes={styledNodes}
        edges={edges as any}
        fitView
        attributionPosition="bottom-right"
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e2d4a" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => NODE_COLORS[n.type as string] ?? '#475569'}
          maskColor="rgba(10,15,30,0.8)"
          style={{ background: '#0f1729', border: '1px solid #1e2d4a' }}
        />
      </ReactFlow>
    </div>
  )
}
