import { useState } from 'react'
import { Button } from '@/components/ui/button'

export type CardSize = 's' | 'm' | 'l'

const KEY = 'cardSize'
const OPTIONS: { value: CardSize; short: string; label: string }[] = [
  { value: 's', short: 'S', label: 'Kleine Karten' },
  { value: 'm', short: 'M', label: 'Mittlere Karten' },
  { value: 'l', short: 'L', label: 'Große Karten' }
]

/** Tailwind needs these as literal strings. */
export const cardGridClass: Record<CardSize, string> = {
  s: 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3',
  m: 'grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3',
  l: 'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4'
}

export function useCardSize(): [CardSize, (size: CardSize) => void] {
  const [size, setSize] = useState<CardSize>(() => {
    const stored = localStorage.getItem(KEY)
    return OPTIONS.find((o) => o.value === stored)?.value ?? 'm'
  })
  return [
    size,
    (next) => {
      setSize(next)
      localStorage.setItem(KEY, next)
    }
  ]
}

export function CardSizeToggle({ value, onChange }: { value: CardSize; onChange: (size: CardSize) => void }) {
  return (
    <div role="group" aria-label="Kartengröße" className="flex rounded-md border p-0.5">
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          size="icon"
          variant={value === o.value ? 'secondary' : 'ghost'}
          className="size-8 text-xs"
          title={o.label}
          aria-label={o.label}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.short}
        </Button>
      ))}
    </div>
  )
}
