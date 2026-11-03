import { FileDrop, Text, Textarea } from '@mond-design-system/react'
import type { ReactNode } from 'react'

// The paste-a-list-in form the rosters and the equipment list share: a file or
// a paste, one entry per line, and the names in the division or role column
// that match nothing.

interface Props {
  /** The columns, in order: "Name, Bib, Division". */
  format: string
  /** Sample lines for the placeholder. */
  example: string[]
  value: string
  onChange: (text: string) => void
  /** What the looked-up column names: "division". */
  refNoun: string
  unknown: string[]
  /** The pick a line with a blank column falls back to. */
  fallback?: ReactNode
  /** How the columns work, when the format line is not enough. */
  help?: ReactNode
  /** Anything else in the list that stops the import. */
  problems?: string[]
  /** What the import will do, once the list can go. */
  summary?: string
}

export function CsvImport({ format, example, value, onChange, refNoun, unknown, fallback, help, problems = [], summary }: Props) {
  const label = `One per line: ${format}`
  return (
    <>
      {fallback}
      {help && <Text variant="meta" tone="muted">{help}</Text>}
      <FileDrop
        label="Drop a CSV here, or choose a file"
        hint={format}
        accept=".csv,text/csv,text/plain"
        onFiles={async (files) => onChange(await files[0].text())}
      />
      <Textarea
        rows={8}
        aria-label={label}
        placeholder={[label, ...example].join('\n')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {unknown.length > 0 && (
        <Text role="alert" variant="meta" tone="danger">
          No {refNoun} named {unknown.join(', ')}. Add it on the setup screen, or fix the list.
        </Text>
      )}
      {problems.map((problem) => (
        <Text key={problem} role="alert" variant="meta" tone="danger">{problem}</Text>
      ))}
      {summary && <Text role="status" variant="meta" tone="muted">{summary}</Text>}
    </>
  )
}
