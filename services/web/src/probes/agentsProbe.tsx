import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

// 🚦 Catálogos estáticos (forzados)
const AGENTS = [
  { id:'asesor', name:'Asesor migratorio', desc:'Respuestas serias' },
  { id:'traductor', name:'Traductor legal', desc:'Traducción fiel' },
  { id:'redactor', name:'Redactor formularios', desc:'Ejemplos' },
  { id:'simulador', name:'Simulador entrevista', desc:'Q&A + feedback' },
]

const PROVIDERS = [
  { id:'openai', label:'OpenAI' },
  { id:'anthropic', label:'Anthropic' },
  { id:'google', label:'Google' },
  { id:'mistral', label:'Mistral' },
]
const MODELS: Record<string,{id:string;label:string}[]> = {
  openai:[{id:'gpt-4o',label:'GPT-4o'},{id:'gpt-4.1-mini',label:'GPT-4.1 mini'}],
  anthropic:[{id:'claude-3.5',label:'Claude 3.5'}],
  google:[{id:'gemini-1.5-pro',label:'Gemini 1.5 Pro'}],
  mistral:[{id:'mistral-large',label:'Mistral Large'}],
}

const DEMO = (import.meta as any).env?.VITE_DEMO_MODE === '1'

function Probe() {
  // toggles para simular “autodetección”
  const [simulateDetection, setSimulateDetection] = useState(true) // si ON: solo OpenAI
  const [forceShowAll, setForceShowAll] = useState(true)           // si ON: ignora filtros

  const detectedProviders = useMemo(
    () => (simulateDetection ? PROVIDERS.filter(p=>p.id==='openai') : PROVIDERS),
    [simulateDetection]
  )

  const providerOptions = useMemo(
    () => (forceShowAll || DEMO ? PROVIDERS : detectedProviders),
    [forceShowAll, simulateDetection]
  )

  const [providerId, setProviderId] = useState(providerOptions[0]?.id ?? 'openai')
  const modelOptions = MODELS[providerId] ?? []

  const reasons:string[] = []
  if (!DEMO) reasons.push('VITE_DEMO_MODE ≠ "1"')
  if (simulateDetection) reasons.push('Filtro de autodetección activo (solo OpenAI)')
  if (!forceShowAll) reasons.push('No se fuerza la lista completa')

  return (
    <div>
      <div className="card">
        <h4>Estado</h4>
        <div className="row">
          <span className="pill">DEMO: <b className={DEMO?'ok':'bad'}>{String(DEMO)}</b></span>
          <span className="pill">Providers detectados: <b>{detectedProviders.map(p=>p.label).join(', ')||'—'}</b></span>
          <span className="pill">Providers mostrados: <b>{providerOptions.map(p=>p.label).join(', ')||'—'}</b></span>
        </div>
        <p style={{opacity:.8}}>
          Si acá ves <code>Anthropic/Google/Mistral</code> pero en tu app no, el problema es un <b>filtro en tu UI</b>.
        </p>
        {reasons.length>0 && (
          <p className="warn">Posibles razones: {reasons.join(' · ')}</p>
        )}
        <div className="row" style={{marginTop:8}}>
          <label className="pill">
            <input type="checkbox" checked={simulateDetection} onChange={e=>setSimulateDetection(e.target.checked)} />
            &nbsp;Simular autodetección (solo OpenAI)
          </label>
          <label className="pill">
            <input type="checkbox" checked={forceShowAll} onChange={e=>setForceShowAll(e.target.checked)} />
            &nbsp;Forzar mostrar todos
          </label>
        </div>
      </div>

      <div className="card">
        <h4>Agentes (forzados)</h4>
        <div className="row">
          {AGENTS.map(a=>(
            <div key={a.id} className="pill" title={a.desc}>{a.name}</div>
          ))}
        </div>
      </div>

      <div className="card">
        <h4>Proveedores y Modelos (forzados)</h4>
        <div className="row" style={{marginBottom:8}}>
          <label>Proveedor:&nbsp;
            <select value={providerId} onChange={e=>setProviderId(e.target.value)}>
              {providerOptions.map(p=> <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          {modelOptions.map(m=> <div key={m.id} className="pill">{m.label}</div>)}
        </div>
      </div>

      <div className="card">
        <h4>Debug</h4>
        <pre><code>{
`VITE_DEMO_MODE = ${String((import.meta as any).env?.VITE_DEMO_MODE)}
providerOptions = ${JSON.stringify(providerOptions.map(p=>p.id))}
models = ${JSON.stringify(modelOptions.map(m=>m.id))}
`}
        </code></pre>
      </div>
    </div>
  )
}

const rootEl = document.getElementById('root')!
createRoot(rootEl).render(<Probe />)

