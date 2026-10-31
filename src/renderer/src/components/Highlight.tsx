/** Renders FTS snippets that use \u0002/\u0003 as highlight markers. */
export function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\u0002[^\u0003]*\u0003)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('\u0002') ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>
      )}
    </>
  )
}
