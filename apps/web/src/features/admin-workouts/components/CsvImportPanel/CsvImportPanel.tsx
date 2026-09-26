import { Button, FileDrop, Inline, Stack, Text, Textarea } from '@mond-design-system/react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { useState } from 'react'
import type { ImportResult } from '@/api/imports'
import styles from './CsvImportPanel.module.css'

// v1 drew this block twice — once for heat assignments, once for judge
// assignments — and the two differ only in their wording and their endpoint.
// One panel, given both.
//
// Three adaptations, each named:
//
// 1. The hidden file input behind a "Choose File" button is the system's
//    FileDrop, which is also a drop target. The pasted-CSV box stays: v1
//    offered both and the box is what the placeholder documents.
// 2. v1's heats import called res.json() on a route that answers plain text on
//    400, so a refusal left the button reading "Importing…" for good (defect
//    21). The refusal is drawn here. Reproducing the hang would mean writing
//    a broken fetch beside the shared one, which is not a port of anything.
// 3. The heats route sends warnings beside the tally and v1 typed them without
//    ever drawing them. They are shown, because a row that landed differently
//    than asked is the one thing a tally cannot say.

/** What the panel needs of a mutation, which is all either import hook gives
    it: fire it, know it is out, read what came back. */
export interface ImportRun {
  mutate: (csv: string) => void
  isPending: boolean
  data?: ImportResult
  error: unknown
}

interface Props {
  /** The panel's heading, which is also what names its region: the two uses
      of this panel are told apart by their title and by nothing else. */
  title: string
  /** The column list, printed as the file's own header row. */
  columns: string
  /** The sentence under it: what importing this file will overwrite. */
  note: string
  placeholder: string
  run: ImportRun
}

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`

export function CsvImportPanel({ title, columns, note, placeholder, run }: Props) {
  const [csv, setCsv] = useState('')

  function change(value: string) {
    setCsv(value)
  }

  async function take(files: File[]) {
    change(await files[0].text())
  }

  const result = run.data
  const errors = result?.errors ?? []

  return (
    <DataPanel title={title} description={note}>
      <Stack gap="base">
        <Text variant="meta" tone="muted">
          CSV columns: <span className={styles.columns}>{columns}</span>
        </Text>

        <FileDrop
          label="Drop a CSV here, or choose a file"
          hint="or paste it below"
          accept=".csv,text/csv,text/plain"
          onFiles={take}
        />

        <Textarea
          aria-label="CSV"
          rows={8}
          value={csv}
          placeholder={placeholder}
          onChange={(e) => change(e.target.value)}
          className={styles.csv}
        />

        <Inline gap="base" align="center">
          <Button
            onClick={() => run.mutate(csv)}
            loading={run.isPending}
            disabled={!csv.trim()}
          >
            {run.isPending ? 'Importing…' : 'Import'}
          </Button>
          {csv && (
            <Button variant="ghost" size="sm" onClick={() => change('')}>Clear</Button>
          )}
        </Inline>

        {run.error != null && (
          <Text role="alert" tone="danger">
            {run.error instanceof Error ? run.error.message : String(run.error)}
          </Text>
        )}

        {result && (
          <Stack gap="tight">
            {result.imported > 0 && (
              <Text tone="success">
                Imported {result.imported} {plural(result.imported, 'assignment')} across{' '}
                {plural(result.workoutsAffected.length, 'workout')}{' '}
                {result.workoutsAffected.map((n) => `#${n}`).join(', ')}.
              </Text>
            )}
            {result.warnings?.map((w, i) => (
              <Text key={i} tone="muted">{w.message}</Text>
            ))}
            {errors.length > 0 && (
              <Stack gap="hairline">
                <Text variant="label" tone="danger">
                  {errors.length} {plural(errors.length, 'error')}:
                </Text>
                {errors.map((e, i) => (
                  <Inline key={i} gap="tight" align="baseline">
                    <Text variant="meta" tone="muted">Line {e.line}</Text>
                    <Text tone="danger">{e.message}</Text>
                  </Inline>
                ))}
              </Stack>
            )}
            {result.imported === 0 && errors.length === 0 && (
              <Text tone="muted">Nothing was imported.</Text>
            )}
          </Stack>
        )}
      </Stack>
    </DataPanel>
  )
}
