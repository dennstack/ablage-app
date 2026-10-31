import type { Category } from '@shared/types'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'

const ALL = '__all__'

export function CategorySelect({
  categories,
  value,
  onChange,
  allowAll = false,
  className
}: {
  categories: Category[]
  value: string
  onChange: (v: string) => void
  allowAll?: boolean
  className?: string
}) {
  return (
    <Select value={value || (allowAll ? ALL : '')} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Kategorie wählen" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {allowAll && <SelectItem value={ALL}>Alle Kategorien</SelectItem>}
        {categories.map((c) => (
          <SelectGroup key={c.id}>
            <SelectLabel>{c.label}</SelectLabel>
            <SelectItem value={c.id}>{c.label} (allgemein)</SelectItem>
            {c.subcategories?.map((s) => (
              <SelectItem key={s.id} value={s.id} className="pl-5">
                {s.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        <SelectGroup>
          <SelectLabel>Weitere</SelectLabel>
          <SelectItem value="sonstiges">Sonstiges</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
