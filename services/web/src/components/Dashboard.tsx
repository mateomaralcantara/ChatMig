import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

const data = [
  { day: 'Lun', intentos: 1, respuestas: 0 },
  { day: 'Mar', intentos: 2, respuestas: 1 },
  { day: 'Mie', intentos: 1, respuestas: 1 },
  { day: 'Jue', intentos: 2, respuestas: 1 },
  { day: 'Vie', intentos: 3, respuestas: 2 },
]

export default function Dashboard() {
  return (
    <div className="card">
      <h2>Progreso semanal</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="intentos" />
          <Line type="monotone" dataKey="respuestas" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

