// Quote-aware CSV split. Mirrors supabase/functions/_shared/csv.ts: the web
// app and the functions share no source, so the rule lives in both and each
// copy carries the same tests. Blank lines are dropped and every cell is
// trimmed. A quoted cell keeps its commas, and "" in quotes is a literal
// quote. Rows cannot span lines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const cells: string[] = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQuote = false
        else cur += ch
      } else {
        if (ch === '"') inQuote = true
        else if (ch === ',') { cells.push(cur.trim()); cur = '' }
        else cur += ch
      }
    }
    cells.push(cur.trim())
    rows.push(cells)
  }
  return rows
}

/** One name per line, or the first column of a CSV. A header row naming the
    column (`header`, any case) and repeats of a name (any case) are dropped. */
export function parseNameList(text: string, header: string): string[] {
  const seen = new Set([header.toLowerCase()])
  const names: string[] = []
  for (const [name] of parseCsv(text)) {
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

/** The names not already in `known`, compared case-insensitively. */
export function withoutKnown(names: string[], known: string[]): string[] {
  const have = new Set(known.map((k) => k.toLowerCase()))
  return names.filter((name) => !have.has(name.toLowerCase()))
}
