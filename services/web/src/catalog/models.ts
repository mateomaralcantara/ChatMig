export const PROVIDERS = [
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic' },
    { id: 'google', label: 'Google' },
    { id: 'mistral', label: 'Mistral' }
  ]
  export const MODELS: Record<string, {id:string; label:string}[]> = {
    openai:    [{id:'gpt-4o',label:'GPT-4o'}, {id:'gpt-4.1-mini',label:'GPT-4.1 mini'}],
    anthropic: [{id:'claude-3.5',label:'Claude 3.5'}],
    google:    [{id:'gemini-1.5-pro',label:'Gemini 1.5 Pro'}],
    mistral:   [{id:'mistral-large',label:'Mistral Large'}],
  }
  export function modelsFor(providerId:string){ return MODELS[providerId] || [] }
  
