// estimación súper simple
export function estimateTokens(text: string) {
    const words = (text || '').trim().split(/\s+/).filter(Boolean).length
    // aprox 0.75 tokens por palabra en español-inglés mezclado
    return Math.round(words * 0.75)
  }
  
