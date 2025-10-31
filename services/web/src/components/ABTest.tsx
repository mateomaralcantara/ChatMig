import React, { useState } from 'react'
import { abgenerate } from '../lib/api'

export default function ABTest() {
  const [goal, setGoal] = useState('invitar a café')
  const [resp, setResp] = useState<any>(null)

  const onGen = async () => {
    const r = await abgenerate({ goal, constraints: ['breve','respetuoso'], variants: 2 })
    setResp(r)
  }

  return (
    <div className="card">
      <h2>Generador A/B</h2>
      <input value={goal} onChange={e=>setGoal(e.target.value)} />
      <button onClick={onGen}>Generar</button>
      {resp && (
        <div>
          <p><b>A:</b> {resp.A}</p>
          <p><b>B:</b> {resp.B}</p>
          <small>Hipótesis: {resp.hypotheses.join(', ')}</small>
        </div>
      )}
    </div>
  )
}

