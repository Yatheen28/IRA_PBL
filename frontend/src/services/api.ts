// API client for VAJRA AI backend
const BASE_URL = ''  // Empty = uses Vite proxy to http://127.0.0.1:8000

export interface EvidenceItem {
  rank: number
  title: string
  url: string
  content: string
  search_score: number | null
  semantic_score: number
  source_domain: string
  source_type: string
  source_reliability_score: number
  reliability_reason: string
  combined_score: number
  stance: string
}

export interface GraphNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
  style?: Record<string, unknown>
}

export interface VerifyResponse {
  original_claim: string
  normalized_claim: string
  language: string
  verdict: string
  analysis_confidence: number
  summary: string
  reasoning: string
  evidence: EvidenceItem[]
  knowledge_graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  limitations: string[]
}

export async function verifyClaim(claim: string): Promise<VerifyResponse> {
  const res = await fetch(`${BASE_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function verifyImage(file: File): Promise<VerifyResponse> {
  const formData = new FormData()
  formData.append('image', file)
  const res = await fetch(`${BASE_URL}/verify/image`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}
