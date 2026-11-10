import { Button, ConfirmDialog, Modal, ModalBody, ModalFooter, ModalHeader, Stack, Text } from '@mond-design-system/react'
import { useState } from 'react'
import { previewHeatImport, useImportHeats, type ExistingHeats } from '@/api/imports'
import { CsvImportPanel, type ImportRun } from '../CsvImportPanel/CsvImportPanel'

// The heat import, with a question first when the file names workouts that
// already have heats: replace them (asked twice, since it deletes lanes and
// whatever was entered on them), or add / update — the file decides the lanes
// it lists and the athletes it names, and everything else stays.
// A file whose workouts have no heats yet just imports.

type Pending = { csv: string; existing: ExistingHeats[] }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const names = (existing: ExistingHeats[]) => existing.map((w) => `Workout ${w.number}`).join(', ')

export function HeatImportPanel({ slug }: { slug: string }) {
  const heats = useImportHeats(slug)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<unknown>(null)
  const [choosing, setChoosing] = useState<Pending | null>(null)
  const [replacing, setReplacing] = useState<Pending | null>(null)

  async function start(csv: string) {
    heats.reset()
    setCheckError(null)
    setChecking(true)
    try {
      const { existing } = await previewHeatImport(slug, csv)
      if (existing.length === 0) heats.mutate({ csv, mode: 'replace' })
      else setChoosing({ csv, existing })
    } catch (e) {
      setCheckError(e)
    } finally {
      setChecking(false)
    }
  }

  const run: ImportRun = {
    mutate: (csv) => void start(csv),
    isPending: checking || heats.isPending,
    data: heats.data,
    error: heats.error ?? checkError,
  }

  return (
    <>
      <CsvImportPanel
        title="Import Heat Assignments"
        columns="workout_number, heat_number, lane_number, athlete_name"
        note="If a workout in the file already has heats, you choose: replace them, or add / update only what the file lists."
        placeholder={'workout_number,heat_number,lane_number,athlete_name\n1,1,1,Jane Smith\n1,1,2,John Doe'}
        run={run}
      />

      <Modal open={choosing != null} onClose={() => setChoosing(null)} label="Some workouts already have heats">
        <ModalHeader>Some workouts already have heats</ModalHeader>
        <ModalBody>
          <Stack gap="base">
            <Stack gap="hairline">
              {choosing?.existing.map((w) => (
                <Text key={w.number}>
                  Workout {w.number} · {w.name}: {plural(w.heats, 'heat')}, {plural(w.lanes, 'lane')}
                  {w.scored ? ' (has scores)' : ''}
                </Text>
              ))}
            </Stack>
            <Text variant="meta" tone="muted">
              <strong>Add / update</strong> places the lanes in the file and moves anyone it names; every other
              heat and lane stays as it is.
            </Text>
            <Text variant="meta" tone="muted">
              <strong>Replace</strong> deletes these workouts&apos; heats and imports the file in their place.
            </Text>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setChoosing(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { setReplacing(choosing); setChoosing(null) }}>Replace…</Button>
          <Button onClick={() => { heats.mutate({ csv: choosing!.csv, mode: 'merge' }); setChoosing(null) }}>
            Add / update
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmDialog<Pending>
        target={replacing}
        onClose={() => setReplacing(null)}
        onConfirm={(p) => heats.mutateAsync({ csv: p.csv, mode: 'replace' })}
        title={replacing ? `Replace every heat in ${names(replacing.existing)}?` : ''}
        description={
          'Are you sure? Their existing heats are deleted and the file goes in their place. Lanes not in the file are '
          + 'removed, with any lane scores, team member picks and knockout results on them, and custom heat start '
          + 'times are reset. This cannot be undone.'
          + (replacing?.existing.some((w) => w.scored) ? ' Some of these workouts have scores.' : '')
        }
        confirmLabel="Yes, replace heats"
        cancelLabel="Cancel"
        tone="danger"
      />
    </>
  )
}
