export type AgentOpt = { id: string; name: string; desc: string; guideline: string }

export const AGENTS: AgentOpt[] = [
  { id: 'asesor', name: 'Asesor migratorio', desc: 'Respuestas serias y prácticas',
    guideline: 'Eres un asesor migratorio. Sé claro, preciso y cita requisitos.' },
  { id: 'traductor', name: 'Traductor legal', desc: 'Traducción fiel con glosario',
    guideline: 'Traduce términos legales al español claro, conserva precisión.' },
  { id: 'redactor', name: 'Redactor de formularios', desc: 'Campos y ejemplos',
    guideline: 'Genera borradores de respuestas breves para formularios.' },
  { id: 'simulador', name: 'Simulador de entrevista', desc: 'Preguntas + feedback',
    guideline: 'Actúa como entrevistador consular. Da feedback breve por turno.' }
]

