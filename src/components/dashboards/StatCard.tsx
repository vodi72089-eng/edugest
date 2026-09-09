'use client'

import React from 'react'
import { TEXT_MUTED_LUXE, TEXT_PRIMARY } from '@/lib/constants'

export default function StatCard({ label, value, delta, icon, color, onClick }: {
  label: string; value: string; delta?: string; icon: React.ReactNode; color: string; onClick?: () => void
}) {
  return (
    <div onClick={onClick} className={`group relative bg-white rounded-2xl p-5 overflow-hidden transition-all duration-300 ${onClick ? 'cursor-pointer hover:scale-[1.02] hover:-translate-y-1' : ''}`} style={{ borderLeft: `4px solid ${color}`, boxShadow: '0 1px 3px oklch(20% 0.02 250 / 0.04), 0 4px 12px oklch(20% 0.02 250 / 0.03)' }}>
      <div className="absolute top-0 right-0 w-[80px] h-[80px] rounded-bl-[80px] opacity-40 transition-opacity group-hover:opacity-70" style={{ background: `radial-gradient(closest-side, ${color}18, transparent)` }} />
      <div className="absolute bottom-0 right-0 w-[40px] h-[40px] rounded-tl-[40px] opacity-20" style={{ background: `radial-gradient(closest-side, ${color}15, transparent)` }} />
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: TEXT_MUTED_LUXE }}>{label}</div>
        <div className="w-10 h-10 rounded-xl grid place-items-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" style={{ color: 'white', background: `linear-gradient(135deg, ${color}, oklch(72% 0.15 65))`, boxShadow: `0 4px 12px ${color}30` }}>{icon}</div>
      </div>
      <div className="text-[28px] font-extrabold tracking-tighter tabular-nums font-mono-premium" style={{ color: TEXT_PRIMARY }}>{value}</div>
      {delta && <div className="text-xs mt-1 font-medium" style={{ color: TEXT_MUTED_LUXE }}>{delta}</div>}
    </div>
  )
}
