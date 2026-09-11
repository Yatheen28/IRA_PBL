import { useState } from 'react'
import './index.css'
import { Home } from './pages/Home'
import { Results } from './pages/Results'
import type { VerifyResponse } from './services/api'

export default function App() {
  const [result, setResult] = useState<VerifyResponse | null>(null)

  return result
    ? <Results result={result} onBack={() => setResult(null)} />
    : <Home onResult={setResult} />
}
