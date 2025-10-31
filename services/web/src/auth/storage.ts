export function migrateAnonDataToUser(userId: string) {
    const anonKeys = [
      'chatmig.messages.v2',
      'chatmig.sessions.v1',
      'chatmig.history.v1'
    ]
    for (const k of anonKeys) {
      const v = localStorage.getItem(k)
      if (!v) continue
      const target = k.replace('chatmig.', `chatmig.${userId}.`)
      const existing = localStorage.getItem(target)
      if (!existing) {
        localStorage.setItem(target, v)
      } else {
        try {
          const a = JSON.parse(existing)
          const b = JSON.parse(v)
          const merged = mergeByIdWithNewest([...toArr(a)], [...toArr(b)])
          localStorage.setItem(target, JSON.stringify(merged))
        } catch {
          localStorage.setItem(target, v)
        }
      }
      localStorage.removeItem(k)
    }
  }
  
  function toArr(x: any) {
    if (Array.isArray(x)) return x
    if (x && Array.isArray(x.items)) return x.items
    return []
  }
  
  function mergeByIdWithNewest(a: any[], b: any[]) {
    const map = new Map<string, any>()
    ;[...a, ...b].forEach((it) => {
      const id = it.id ?? cryptoRandom()
      const prev = map.get(id)
      if (!prev || (it.updated ?? it.time ?? 0) > (prev.updated ?? prev.time ?? 0)) {
        map.set(id, { ...it, id })
      }
    })
    return Array.from(map.values())
  }
  
  function cryptoRandom() {
    return 'U-' + Math.random().toString(36).slice(2, 10)
  }
  
