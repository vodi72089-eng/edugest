'use client'

import React from 'react'
import { TEXT_MUTED_LUXE, TEXT_PRIMARY } from '@/lib/constants'

export default function StatCard({ label, value, delta, icon, color }: {
  label: string; value: string; delta?: string; icon: React.ReactNode; color: string
}) {
  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 relative overflow-hidden shadow-sm hover:shadow-md transition" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="absolute top-0 right-0 w-[60px] h-[60px] rounded-bl-[60px] opacity-50" style={{ background: `radial-gradient(closest-side, ${color}22, transparent)` }} />
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>{label}</div>
        <div className="w-10 h-10 rounded-full grid place-items-center" style={{ color: 'white', background: `linear-gradient(135deg, ${color}, oklch(72% 0.15 65))` }}>{icon}</div>
      </div>
      <div className="text-[28px] font-bold tracking-tight tabular-nums" style={{ color: TEXT_PRIMARY }}>{value}</div>
      {delta && <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{delta}</div>}
    </div>
  )
}
