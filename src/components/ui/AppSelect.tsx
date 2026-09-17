'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | DropdownOption>;
  placeholder?: string;
  disabled?: boolean;
  /** Variante sombre (fonds foncés, ex. hero public) */
  dark?: boolean;
  /** Classes additionnelles pour le bouton déclencheur */
  triggerClassName?: string;
  /** Classes additionnelles pour le panneau de la liste */
  panelClassName?: string;
  /** Classes du conteneur racine (ex. largeurs personnalisées) */
  className?: string;
  /** Styles inline appliqués au bouton déclencheur */
  style?: React.CSSProperties;
}

function normalize(options: Array<string | DropdownOption>): DropdownOption[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

/**
 * Dropdown select personnalisé de l'app (remplace les <select> natifs).
 * Même rendu/UX que le dropdown introduit dans la vue Médicale.
 */
export default function AppSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  dark = false,
  triggerClassName = '',
  panelClassName = '',
  className = '',
  style,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // Position du panneau (portail) : calculée à l'ouverture, avec bascule
  // vers le haut si pas assez de place en bas (cartes, modales…).
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const items = normalize(options);
  const selected = items.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Le panneau est en portail : tout scroll/resize le referme (position recalculée à l'ouverture).
    function onScrollResize() {
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open ]);

  function openList() {
    const idx = items.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
    // Bascule haut/bas selon la place disponible (jamais coupé).
    try {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) {
        const listH = Math.min(224, items.length * 37 + 8);
        const up = window.innerHeight - r.bottom < listH && r.top > window.innerHeight - r.bottom;
        setPos(
          up
            ? { bottom: window.innerHeight - r.top + 6, left: r.left, width: r.width }
            : { top: r.bottom + 6, left: r.left, width: r.width }
        );
      } else {
        setPos(null);
      }
    } catch {
      setPos(null);
    }
    setOpen(true);
  }

  function toggleOpen() {
    if (open) {
      setOpen(false);
    } else {
      openList();
    }
  }

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onButtonKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openList();
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && highlight < items.length) choose(items[highlight].value);
    }
  }

  const triggerBase = dark
    ? `w-full text-sm rounded-xl px-5 py-4 flex items-center justify-between gap-2 outline-none transition-all appearance-none font-bold border backdrop-blur-md ${
        open
          ? 'border-white/30 bg-white/15 ring-2 ring-white/10'
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`
    : `w-full text-sm border rounded-xl px-3 py-2 bg-white flex items-center justify-between gap-2 outline-none transition ${
        open ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200'
      }`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={onButtonKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={style}
        className={`${triggerBase} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${triggerClassName}`}
      >
        <span
          className={`truncate ${
            dark
              ? selected
                ? 'text-white'
                : 'text-gray-400'
              : selected
                ? 'text-slate-900'
                : 'text-slate-400'
          }`}
        >
          {selected ? selected.label : placeholder || 'Sélectionner...'}
        </span>
        <ChevronDown
          size={dark ? 18 : 15}
          className={`shrink-0 transition-transform ${dark ? 'text-gray-400' : 'text-slate-400'} ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            role="listbox"
            tabIndex={0}
            autoFocus
            onKeyDown={onListKey}
            onPointerDown={(e) => e.stopPropagation()}
            style={
              pos
                ? {
                    position: 'fixed',
                    zIndex: 100,
                    left: Math.max(8, Math.min(pos.left, window.innerWidth - pos.width - 8)),
                    width: pos.width,
                    ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
                  }
                : { position: 'fixed', zIndex: 100, left: 8, right: 8, top: '30%' }
            }
            className={`mt-0 max-h-56 overflow-y-auto py-1 outline-none rounded-xl shadow-xl ${
              dark
                ? 'bg-[#0a0f0d] border border-white/15 shadow-black/40'
                : 'bg-white border border-slate-200 shadow-slate-900/10'
            } ${panelClassName}`}
          >
          {items.map((o, i) => {
            const active = o.value === value;
            return (
              <li
                key={`${o.value}-${i}`}
                role="option"
                aria-selected={active}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setHighlight(i)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 ${
                  dark
                    ? i === highlight
                      ? 'bg-white/10'
                      : ''
                    : i === highlight
                      ? 'bg-rose-50'
                      : ''
                } ${
                  dark
                    ? active
                      ? 'text-amber-300 font-semibold'
                      : 'text-gray-200'
                    : active
                      ? 'text-rose-700 font-semibold'
                      : 'text-slate-700'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {active && <Check size={14} className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
