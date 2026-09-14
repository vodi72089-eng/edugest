'use client'

import * as React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Drop-in replacement for native <select>: keeps the value/onChange(e.target.value)
// contract and accepts <option> children, but renders a shadcn-style dropdown.

type OptionLike = { value: string; label: React.ReactNode; disabled?: boolean }

function collectOptions(children: React.ReactNode): OptionLike[] {
  const out: OptionLike[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    // Flatten arrays produced by .map()
    if (Array.isArray((child as unknown as { type: symbol }).type) || child.type === React.Fragment) {
      out.push(...collectOptions((child.props as { children?: React.ReactNode }).children))
      return
    }
    const props = child.props as { value?: string; children?: React.ReactNode; disabled?: boolean }
    out.push({ value: props.value ?? '', label: props.children, disabled: props.disabled })
  })
  return out
}

export interface FancySelectProps {
  value?: string | number
  defaultValue?: string | number
  onChange?: (e: { target: { value: string } }) => void
  children?: React.ReactNode
  className?: string
  disabled?: boolean
  id?: string
  name?: string
  required?: boolean
  'aria-label'?: string
}

export const FancySelect = React.forwardRef<HTMLButtonElement, FancySelectProps>(
  ({ value, onChange, children, className, disabled, id, name, 'aria-label': ariaLabel }, ref) => {
    const options = React.useMemo(() => collectOptions(children), [children])
    const current = value !== undefined ? String(value) : undefined
    const selected = options.find((o) => o.value === current)

    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            ref={ref}
            id={id}
            name={name}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              'inline-flex items-center justify-between gap-2 text-left font-medium transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(72%_0.15_65_/_0.4)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              !selected && 'text-muted-foreground',
              className
            )}
          >
            <span className="truncate">{selected ? selected.label : '\u00A0'}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            position="popper"
            sideOffset={5}
            className="z-[100] min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto rounded-xl border border-[oklch(90%_0.01_175)] bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            {options.map((opt) => {
              const isSelected = opt.value === current
              return (
                <DropdownMenu.Item
                  key={opt.value || `opt-${opt.label}`}
                  disabled={opt.disabled}
                  onSelect={() => {
                    onChange?.({ target: { value: opt.value } })
                  }}
                  className={cn(
                    'flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors',
                    'focus:bg-[oklch(95%_0.02_175)] data-[highlighted]:bg-[oklch(95%_0.02_175)]',
                    isSelected
                      ? 'bg-[oklch(96%_0.03_90)] font-semibold text-[oklch(45%_0.1_80)]'
                      : 'text-foreground',
                    opt.disabled && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-[oklch(60%_0.14_80)]" />}
                </DropdownMenu.Item>
              )
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
  }
)
FancySelect.displayName = 'FancySelect'
