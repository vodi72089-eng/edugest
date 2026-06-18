'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, ChevronRight } from 'lucide-react'
import { ACCENT, GOLD, GOLD_SOFT, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import { getInitials } from '@/lib/helpers'

export interface AutocompleteItem {
  id: string
  label: string
  sublabel?: string
  photoUrl?: string
}

export default function SearchAutocomplete({
  label,
  placeholder,
  items,
  selectedId,
  onSelect,
  onClear,
  searchQuery,
  onSearchChange,
  loading = false,
  emptyMessage = 'Aucun résultat',
  itemTypeName = 'résultat',
  className = '',
}: {
  label?: string
  placeholder?: string
  items: AutocompleteItem[]
  selectedId: string | null
  onSelect: (item: AutocompleteItem) => void
  onClear: () => void
  searchQuery: string
  onSearchChange: (value: string) => void
  loading?: boolean
  emptyMessage?: string
  itemTypeName?: string
  className?: string
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedItem = selectedId ? items.find(i => i.id === selectedId) : null
  const displayValue = selectedItem ? selectedItem.label : searchQuery

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (item: AutocompleteItem) => {
    onSelect(item)
    setShowDropdown(false)
  }

  const handleClear = () => {
    onClear()
    setShowDropdown(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value)
    setShowDropdown(true)
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>{label}</label>
      )}
      <div className="flex items-center gap-2 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[oklch(72%_0.15_65_/_0.3)] focus-within:border-[oklch(72%_0.15_65_/_0.5)] transition">
        <Search size={14} style={{ color: TEXT_MUTED_LUXE }} />
        <input
          placeholder={placeholder || 'Rechercher...'}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => { if (items.length > 0 || searchQuery.length >= 2) setShowDropdown(true) }}
          className="flex-1 border-0 bg-transparent outline-none text-sm"
        />
        {(selectedId || searchQuery) && (
          <button onClick={handleClear} className="text-[oklch(45%_0.18_25)] hover:text-[oklch(35%_0.20_25)] shrink-0">
            <X size={14} />
          </button>
        )}
      </div>
      {selectedId && selectedItem && (
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: GOLD_SOFT, color: GOLD }}>
          <div className="w-6 h-6 rounded-full grid place-items-center text-white text-[9px] font-bold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
            {getInitials(selectedItem.label)}
          </div>
          {selectedItem.label}
          {selectedItem.sublabel && <span className="text-[10px] opacity-70">({selectedItem.sublabel})</span>}
        </div>
      )}
      {showDropdown && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-[oklch(90%_0.01_175)] rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-4 text-center text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>
              <div className="h-5 w-5 border-2 border-[oklch(90%_0.01_175)] border-t-[oklch(72%_0.15_65)] rounded-full animate-spin mx-auto mb-2" />
              Recherche...
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-4 text-center text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>
              {searchQuery.length < 2 ? 'Tapez au moins 2 caractères...' : emptyMessage}
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b border-[oklch(92%_0.005_250)]" style={{ color: TEXT_MUTED_LUXE }}>
                {items.length} {itemTypeName}{items.length > 1 ? 's' : ''} trouvé{items.length > 1 ? 's' : ''}
              </div>
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="w-full text-left px-3 py-2.5 hover:bg-[oklch(97%_0.02_65)] transition flex items-center gap-3 border-b border-[oklch(94%_0.005_250)] last:border-0 cursor-pointer group"
                >
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.label} className="w-8 h-8 rounded-full object-cover shrink-0 group-hover:scale-110 transition" />
                  ) : (
                    <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0 group-hover:scale-110 transition" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                      {getInitials(item.label)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold group-hover:text-[oklch(55%_0.15_65)] transition" style={{ color: TEXT_PRIMARY }}>{item.label}</div>
                    {item.sublabel && <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{item.sublabel}</div>}
                  </div>
                  <ChevronRight size={14} className="text-[oklch(80%_0.01_175)] group-hover:text-[oklch(72%_0.15_65)] transition shrink-0" />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
