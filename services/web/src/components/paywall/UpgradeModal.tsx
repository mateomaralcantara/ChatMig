import React from 'react'
import { createCheckout } from '../../api/billing'

export default function UpgradeModal({ onClose }: { onClose?: () => void }) {
  const go = async () => {
    const { url } = await createCheckout('pro')
    window.location.href = url
  }
  return (
    <div style={{ padding: 16, border: '1px solid #333', borderRadius: 8 }}>
      <h3>Sin cuota suficiente</h3>
      <p>Subite a <b>Pro</b> para seguir usando ChatMig sin límites diarios apretados.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={go}>Mejorar a Pro</button>
        <button onClick={onClose}>Seguir luego</button>
      </div>
    </div>
  )
}

