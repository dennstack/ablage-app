const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const moneyFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d)
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  return dateTimeFmt.format(new Date(iso))
}

export function formatAmount(v: number | null | undefined): string {
  return v === null || v === undefined ? '–' : moneyFmt.format(v)
}
