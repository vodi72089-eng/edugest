'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface MedicalDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | DropdownOption>;
  placeholder?: string;
  disabled?: boolean;
}

function normalize(options: Array<string | DropdownOption>): DropdownOption[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

export default function MedicalDropdown({ value, onChange, options, placeholder, disabled }: MedicalDropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
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
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  useEffect(() => {
    if (open) {
      const idx = items.findIndex((o) => o.value === value);
      setHighlight(idx >= 0 ? idx : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onButtonKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        className={`w-full text-sm border rounded-xl px-3 py-2 bg-white flex items-center justify-between gap-2 outline-none transition ${
          open ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`truncate ${selected ? 'text-slate-900' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder || 'Sélectionner...'}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          tabIndex={0}
          autoFocus
          onKeyDown={onListKey}
          className="absolute z-30 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 max-h-56 overflow-y-auto py-1 outline-none"
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
                  i === highlight ? 'bg-rose-50' : ''
                } ${active ? 'text-rose-700 font-semibold' : 'text-slate-700'}`}
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
