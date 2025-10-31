import React, { useState } from 'react'
import { plan, evaluate } from '../lib/api'

export default function Chat() {
  const [goal, setGoal] = useState('invitar a café')
  const [draft, setDraft] = useState('Hey, esta semana estaré por tu zona. ¿Te late un café el jueves 6pm?')
  const [resp, setResp] = useState<any>(null)

  const onPlan = async () => {
    const r = await plan({ goal, context: { channel: 'whatsapp', relationship_stage: 'conociéndose' }, message_draft: draft })
    setResp(r)
  }

  const onEval = async () => {
    const r = await evaluate({ goal, context: { channel: 'whatsapp' }, message: draft })
    setResp(r)
  }

  return (
    <div className="card">
      <h2>ChatMig — Plan & Evaluación</h2>
      <label>Objetivo</label>
      <input value={goal} onChange={e=>setGoal(e.target.value)} />
      <label>Borrador de mensaje</label>
      <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={4}/>
      <div style={{display:'flex', gap:8, marginTop:8}}>
        <button onClick={onPlan}>Generar plan</button>
        <button onClick={onEval}>Evaluar</button>
      </div>
      {resp && (
        <pre style={{marginTop:12, background:'#111', color:'#0f0', padding:12}}>{JSON.stringify(resp, null, 2)}</pre>
      )}
    </div>
  )
}

