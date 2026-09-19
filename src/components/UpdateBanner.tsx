'use client'

import { useEffect, useState } from 'react'

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'portable'; version: string; url: string }
  | { kind: 'error'; message: string }

function getBridge(): any | null {
  try {
    const w = window as any
    return w.__edugest?.updates || null
  } catch {
    return null
  }
}

/**
 * Bannière de mise à jour in-app (desktop uniquement, invisible sur le web).
 * États : disponible → téléchargement (%) → prête (redémarrer).
 * Zéro popup : tout se passe simplement dans l'app.
 */
export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.onEvent) return
    const off = bridge.onEvent((payload: any) => {
      if (!payload?.type) return
      setDismissed(false)
      if (payload.type === 'available') {
        setState({ kind: 'available', version: String(payload.version || '') })
      } else if (payload.type === 'downloading') {
        setState((prev) => ({
          kind: 'downloading',
          version: 'version' in prev && prev.version ? (prev as any).version : String(payload.version || ''),
          percent: Number(payload.percent || 0),
        }))
      } else if (payload.type === 'ready') {
        setState({ kind: 'ready', version: String(payload.version || '') })
      } else if (payload.type === 'portable') {
        setState({ kind: 'portable', version: String(payload.version || ''), url: String(payload.url || '') })
      } else if (payload.type === 'error') {
        setState({ kind: 'error', message: String(payload.message || 'Échec du téléchargement') })
      }
    })
    return off
  }, [])

  // « Plus tard » n'efface pas la mise à jour : rappel automatique toutes les
  // 30 minutes tant qu'une MAJ reste en attente (et à chaque nouvel événement).
  // (Hook AVANT tout return conditionnel — règles des Hooks.)
  useEffect(() => {
    if (!dismissed) return
    if (state.kind !== 'available' && state.kind !== 'portable' && state.kind !== 'ready') return
    const t = setTimeout(() => setDismissed(false), 30 * 60 * 1000)
    return () => clearTimeout(t)
  }, [dismissed, state.kind])

  if (state.kind === 'idle' || dismissed) return null
  const bridge = getBridge()

  const bar: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '8px 16px',
    background: 'oklch(15% 0.02 250)',
    color: '#fff',
    fontSize: 13,
    boxShadow: '0 2px 12px rgba(0,0,0,.25)',
  }
  const btn: React.CSSProperties = {
    background: '#f5a623',
    color: '#0a0f0d',
    border: 'none',
    borderRadius: 8,
    padding: '4px 12px',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  }
  const ghost: React.CSSProperties = {
    background: 'transparent',
    color: 'rgba(255,255,255,.6)',
    border: 'none',
    fontSize: 12,
    cursor: 'pointer',
  }

  return (
    <div style={bar}>
      {state.kind === 'available' && (
        <>
          <span>✨ Mise à jour disponible{state.version ? ` (v${state.version})` : ''} — vos données sont conservées.</span>
          <button style={btn} onClick={() => { bridge?.download?.(); setState({ kind: 'downloading', version: state.version, percent: 0 }); }}>
            Télécharger
          </button>
          <button style={ghost} onClick={() => setDismissed(true)}>Plus tard</button>
        </>
      )}
      {state.kind === 'downloading' && (
        <>
          <span>Téléchargement de la mise à jour… {state.percent}%</span>
          <div style={{ width: 120, height: 4, background: 'rgba(255,255,255,.15)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, Math.max(0, state.percent))}%`, height: '100%', background: '#f5a623' }} />
          </div>
        </>
      )}
      {state.kind === 'ready' && (
        <>
          <span>✅ Mise à jour téléchargée{state.version ? ` (v${state.version})` : ''}.</span>
          <button style={btn} onClick={() => bridge?.install?.()}>Redémarrer</button>
          <button style={ghost} onClick={() => setDismissed(true)}>Plus tard</button>
        </>
      )}
      {state.kind === 'portable' && (
        <>
          <span>✨ Mise à jour disponible{state.version ? ` (v${state.version})` : ''}.</span>
          <button style={btn} onClick={() => state.url && bridge?.openPage?.(state.url)}>Télécharger</button>
          <button style={ghost} onClick={() => setDismissed(true)}>Plus tard</button>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <span>⚠️ {state.message}</span>
          <button style={ghost} onClick={() => setDismissed(true)}>Fermer</button>
        </>
      )}
    </div>
  )
}
