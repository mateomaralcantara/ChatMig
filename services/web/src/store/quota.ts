const KEY = 'chatmig.local.quota.daily'
type Entry = { day: string; used: number }
let state: Entry = load()

function load(): Entry {
  const s = localStorage.getItem(KEY)
  if (!s) return { day: dayStr(new Date()), used: 0 }
  try {
    const v = JSON.parse(s) as Entry
    if (v.day !== dayStr(new Date())) return { day: dayStr(new Date()), used: 0 }
    return v
  } catch { return { day: dayStr(new Date()), used: 0 } }
}

function save() { localStorage.setItem(KEY, JSON.stringify(state)) }

function dayStr(d: Date) {
  return d.toISOString().slice(0,10)
}

type Listener = (used: number) => void
const listeners = new Set<Listener>()
function emit() { listeners.forEach((fn)=> fn(state.used)) }

export function getUsedToday() { return state.used }
export function addTokens(n: number) {
  const today = dayStr(new Date())
  if (state.day !== today) state = { day: today, used: 0 }
  state.used += Math.max(0, n)
  save(); emit()
}
export function onChange(fn: Listener) {
  listeners.add(fn); return () => listeners.delete(fn)
}

