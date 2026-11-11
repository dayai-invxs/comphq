import { Badge, Button, DataTable, EmptyState, Link, Skeleton, Stack, Text } from '@mond-design-system/react'
import type { DataColumn } from '@mond-design-system/react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useEquipmentSummary } from '@/api/equipmentSummary'
import { useImportJudgeAssignments } from '@/api/imports'
import { useSettings, useUpdateSettings } from '@/api/settings'
import { useWorkoutLocations } from '@/api/workoutLocations'
import { useCreateWorkout, useWorkouts, type Workout, type WorkoutDraft } from '@/api/workouts'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { Notice } from '@/components/Notice/Notice'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { RouterAnchor } from '@/components/RouterAnchor'
import { useIsCompetitionAdmin } from '@/lib/competitionRole'
import { scoreTypeLabel } from '@/lib/scoreTypes'
import { statusBadge } from '@/lib/workoutStatus'
import { AddWorkoutForm } from '../components/AddWorkoutForm/AddWorkoutForm'
import { CsvImportPanel } from '../components/CsvImportPanel/CsvImportPanel'
import { HeatImportPanel } from '../components/HeatImportPanel/HeatImportPanel'
import { EquipmentMasterList } from '../components/EquipmentMasterList/EquipmentMasterList'
import { TiebreakPicker } from '../components/TiebreakPicker/TiebreakPicker'

// v1: src/app/[slug]/admin/workouts/page.tsx. The workouts of one competition,
// the settings that order the leaderboard once they are scored, and the two
// CSV imports that fill their heats.
//
// v1 funnelled every failure through one `run(label, op)` wrapper into one
// dismissible banner. The labels are kept because they are what says which of
// four requests failed; the create's own failure stays in the form, where the
// values that caused it still are.
//
// v1 drew the workouts as a column of cards, each one a link. A workout has a
// number, a name, a lane count, a score type and a status, which is a row of
// five values — so it is a table, and the number leads it because that is what
// the room calls the workout.
//
// The panel around that table carries no title of its own: the screen is the
// workouts, so the h1 already names it and the count already sits under it.

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function WorkoutsAdminPage() {
  // A competition user (scorekeeper) activates workouts and opens them to
  // score; adding them, the tiebreak and the imports are the admin's.
  const isAdmin = useIsCompetitionAdmin()
  const { slug = '' } = useParams()

  const workouts = useWorkouts(slug)
  const locations = useWorkoutLocations(slug)
  const settings = useSettings(slug)
  const saveSettings = useUpdateSettings(slug)
  const create = useCreateWorkout(slug)

  const [showEquipment, setShowEquipment] = useState(false)
  const equipment = useEquipmentSummary(slug, showEquipment)

  const judges = useImportJudgeAssignments(slug)

  const [adding, setAdding] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)

  // v1's labelled failures, in the order it ran them — each named by the read
  // that failed, so the banner sends the admin to the right list.
  const labelled = [
    ['Load workouts', workouts.error],
    ['Load locations', locations.error],
    ['Load settings', settings.error],
    ['Save tiebreaker', saveSettings.error],
    ['Load equipment summary', equipment.error],
  ] as const
  const found = labelled.find(([, e]) => e != null)
  const failure = found ? `${found[0]}: ${message(found[1])}` : null

  function handleCreate(draft: WorkoutDraft) {
    create.mutateAsync(draft).then(() => setAdding(false), () => {})
  }

  function openForm() {
    setAdding(true)
    create.reset()
  }

  function loadEquipment() {
    if (showEquipment) equipment.refetch()
    else setShowEquipment(true)
  }

  const rows = workouts.data ?? []

  const columns: DataColumn<Workout>[] = [
    {
      key: 'workout',
      header: 'Workout',
      cell: (w) => (
        <Link as={RouterAnchor} href={`/${slug}/admin/workouts/${w.id}`} variant="plain">
          WOD {w.number}: {w.name}
        </Link>
      ),
    },
    {
      key: 'lanes',
      header: 'Lanes',
      width: '6rem',
      cell: (w) => <Text as="span" tone="muted">{w.lanes}</Text>,
    },
    {
      key: 'score',
      header: 'Score',
      cell: (w) => <Text as="span" tone="muted">{scoreTypeLabel(w.scoreType)}</Text>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      cell: (w) => {
        const badge = statusBadge(w.status)
        return <Badge tone={badge.tone}>{badge.label}</Badge>
      },
    },
  ]

  return (
    <PageFrame
      title="Workouts"
      description={rows.length ? `${rows.length} in this competition` : 'Every workout and how it is scored'}
      wide
      actions={isAdmin ? <Button onClick={openForm}>Add workout</Button> : undefined}
    >
      {failure && failure !== dismissed && (
        <Notice tone="danger" onDismiss={() => setDismissed(failure)} dismissLabel="Dismiss error">
          {failure}
        </Notice>
      )}

      {workouts.isPending ? (
        <div aria-busy="true">
          <Stack gap="base">
            <Skeleton variant="rect" height="var(--mds-space-9)" />
            <Skeleton lines={4} />
          </Stack>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No workouts yet"
          description={isAdmin
            ? 'A workout carries its own lanes, its clocks and how it is scored. Heats are generated from it once athletes are entered.'
            : 'A competition admin adds the workouts. They appear here once they have.'}
          action={isAdmin ? <Button onClick={openForm}>Add workout</Button> : undefined}
        />
      ) : (
        <DataPanel flush>
          <DataTable
            label="Workouts"
            columns={columns}
            rows={rows}
            rowKey={(w) => String(w.id)}
            rowLabel={(w) => `WOD ${w.number}: ${w.name}`}
          />
        </DataPanel>
      )}

      <EquipmentMasterList
        items={showEquipment ? equipment.data : undefined}
        loading={equipment.isFetching}
        onLoad={loadEquipment}
      />

      {isAdmin && <>
      <TiebreakPicker
        workouts={rows}
        workoutId={settings.data?.tiebreakWorkoutId ?? null}
        onPick={(workoutId) => saveSettings.mutate({ tiebreakWorkoutId: workoutId })}
        saving={saveSettings.isPending}
      />

      <HeatImportPanel slug={slug} />

      <CsvImportPanel
        title="Import Judge Assignments"
        columns="workout_number, heat_number, lane, judge_name"
        note={'Judge must be a volunteer with a “Judge” role. Overwrites existing assignment for that lane.'}
        placeholder={'workout_number,heat_number,lane,judge_name\n1,1,3,Alice Johnson\n1,2,1,Bob Smith'}
        run={judges}
      />
      </>}

      <AddWorkoutForm
        open={adding}
        locations={locations.data ?? []}
        saving={create.isPending}
        error={create.error}
        onClose={() => setAdding(false)}
        onCreate={handleCreate}
      />
    </PageFrame>
  )
}
