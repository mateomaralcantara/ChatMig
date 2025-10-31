import React, { useEffect, useState } from 'react'
import { AGENTS } from '../../catalog/agents'

const KEY = 'chatmig.pref.agentId'
export default function AgentSelector({ onChange }:{ onChange?:(id:string)=>void }) {
  const [id, setId] = useState<string>(localStorage.getItem(KEY) || AGENTS[0].id)
  useEffect(()=>{ localStorage.setItem(KEY, id); onChange?.(id) }, [id])
  return (
    <label style={{display:'inline-flex',gap:8,alignItems:'center'}}>
      <span>Agente</span>
      <select value={id} onChange={e=>setId(e.target.value)}>
        {AGENTS.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  )
}

