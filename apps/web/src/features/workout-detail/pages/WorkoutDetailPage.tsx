import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Inline,
  Skeleton,
  Stack,
  Text,
} from '@mond-design-system/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useSetScorePoints } from '@/api/scores'
import { useSettings } from '@/api/settings'
import { useWorkoutLocations } from '@/api/workoutLocations'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import { Notice } from '@/components/Notice/Notice'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { calcHeatStartMs, fmtHeatTime } from '@/lib/heatTime'
import { scoreTypeLabel } from '@/lib/scoreTypes'
import { statusBadge } from '@/lib/workoutStatus'
import { HeatCard } from '../components/HeatCard/HeatCard'
import { HeatRail, type HeatSummary } from '../components/HeatRail/HeatRail'
import { HeatDndProvider } from '../components/heat-dnd-context'
import { WorkoutEditForm } from '../components/WorkoutEditForm/WorkoutEditForm'
import { WorkoutEquipmentPopover } from '../components/WorkoutEquipmentPopover/WorkoutEquipmentPopover'
import { WorkoutLeaderboard } from '../components/WorkoutLeaderboard/WorkoutLeaderboard'
import { useScoreInputs } from '../useScoreInputs'
import { useWorkoutDetail, type ScorePayload } from '../useWorkoutDetail'
import { useWorkoutJudges } from '../useWorkoutJudges'
import styles from './WorkoutDetailPage.module.css'

// v1: src/app/[slug]/admin/workouts/[id]/page.tsx. The screen one workout is run
// from — its settings, its heats, the judge in each lane and the scores typed
// into them. Every request, guard and label below is v1's.
//
// Three things v1 held here live elsewhere now, and none of them changes what
// the screen does. The judge quartet is `useWorkoutJudges`, because the page was
// already the largest file in the slice. The locations list and the
// consecutive-heat limit come from the shared queries the other admin screens
// read them through, so a competition-wide setting is fetched once. And v1's six
// `confirm()` calls are one `ConfirmDialog`, chosen by which question was asked.
//
// The heats read in two panes where the screen is wide enough for a second
// rail: the index of heats and every control that acts on the whole workout on
// the left, the heats themselves — the lanes, the judges and the score boxes —
// on the right. v1 ran the lot down one column, so on a twelve-heat workout the
// buttons that save it were a page-length scroll away from the last heat typed
// into, and which heats were still unscored could only be answered by reading
// all of them.
//
// Both panes are drawn at once, and the left one navigates rather than selects.
// That is not a compromise on the layout, it is what the layout has to be: an
// athlete is moved between heats by dragging their row into another heat, and
// `resolveDropTarget` finds that heat by measuring where its rows are on
// screen. A heat that is not rendered has no rows to measure, and one hidden
// with `display: none` measures as a zero-sized box at the origin — either way
// the drop lands somewhere it was not aimed.

type PromptKey = 'unlock' | 'clearScores' | 'reset' | 'delete' | 'generateJudges' | 'clearJudges'

type Prompt = {
  title: string
  description: string
  confirmLabel: string
  tone?: 'danger' | 'warning'
  run: () => Promise<unknown>
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function WorkoutDetailPage() {
  const { slug = '', id = '' } = useParams()
  const navigate = useNavigate()
  const workoutsPath = `/${slug}/admin/workouts`

  const [editing, setEditing] = useState(false)
  const [heatsUnlocked, setHeatsUnlocked] = useState(false)
  const [prompt, setPrompt] = useState<PromptKey | null>(null)

  const detail = useWorkoutDetail(id, { slug, onNotFound: () => navigate(workoutsPath) })
  const inputs = useScoreInputs(detail.workout)
  const judges = useWorkoutJudges(id, slug)
  const locations = useWorkoutLocations(slug)
  const settings = useSettings(slug)
  const override = useSetScorePoints(slug)

  // Re-hydrate input fields every time the workout reloads.
  useEffect(() => {
    if (detail.workout) inputs.hydrate(detail.workout)
    // inputs.hydrate is stable (useCallback with []); depending on detail.workout identity is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.workout])

  const { byHeat, heatNums, scoredCount, totalAthletes, someScored, completedHeatNums } = useMemo(() => {
    const w = detail.workout
    if (!w) {
      return { byHeat: {}, heatNums: [], scoredCount: 0, totalAthletes: 0, someScored: false, completedHeatNums: [] as number[] }
    }
    const grouped = w.assignments.reduce<Record<number, typeof w.assignments>>((acc, a) => {
      ;(acc[a.heatNumber] ??= []).push(a)
      return acc
    }, {})
    const nums = Object.keys(grouped).map(Number).sort((a, b) => a - b)
    const scored = w.scores.filter((s) => s.rawScore != null).length
    return {
      byHeat: grouped,
      heatNums: nums,
      scoredCount: scored,
      totalAthletes: w.assignments.length,
      someScored: scored > 0,
      completedHeatNums: w.completedHeats ?? [],
    }
  }, [detail.workout])

  const maxConsecutive = settings.data?.judgeMaxConsecutive ?? 3

  const prompts: Record<PromptKey, Prompt> = {
    unlock: {
      title: 'Regenerate heats?',
      description: 'Regenerating heats will replace all existing assignments. Athletes may be moved between heats.',
      confirmLabel: 'Unlock',
      tone: 'warning',
      run: async () => setHeatsUnlocked(true),
    },
    clearScores: {
      title: 'Clear all scores for this workout?',
      description: 'This will also reset the workout to active.',
      confirmLabel: 'Clear all scores',
      tone: 'danger',
      run: async () => { inputs.clear(); await detail.clearScores() },
    },
    reset: {
      title: 'Reset this workout?',
      description: 'This will permanently clear all scores, reopen all heats, and set the workout back to draft. This cannot be undone.',
      confirmLabel: 'Reset workout',
      tone: 'danger',
      run: async () => { inputs.clear(); await detail.resetWorkout() },
    },
    delete: {
      title: 'Delete this workout?',
      description: 'The workout, its heats and its scores go with it.',
      confirmLabel: 'Delete workout',
      tone: 'danger',
      run: async () => { await detail.deleteWorkout(); navigate(workoutsPath) },
    },
    generateJudges: {
      title: 'Replace the judges already assigned?',
      description: 'Auto-generating will replace all existing judge assignments.',
      confirmLabel: 'Auto-assign judges',
      tone: 'warning',
      run: () => judges.generate(maxConsecutive),
    },
    clearJudges: {
      title: 'Clear all judge assignments for this workout?',
      description: 'Every lane goes back to unjudged.',
      confirmLabel: 'Clear judges',
      tone: 'danger',
      run: () => judges.clear(),
    },
  }

  // The read answers, 404s back to the list, or fails outright. Only the
  // failure gets words; while it is pending, the shape of what is coming is
  // drawn rather than the word "Loading".
  if (!detail.workout) {
    return (
      <PageFrame title="Workout" wide>
        {detail.error ? (
          <Notice tone="danger">Error: {detail.error}</Notice>
        ) : (
          <div aria-busy="true">
            <Stack gap="base">
              <Skeleton variant="rect" height="var(--mds-space-9)" />
              <Skeleton lines={6} />
            </Stack>
          </div>
        )}
      </PageFrame>
    )
  }
  const workout = detail.workout

  function payloadsFor(athleteIds: number[]): ScorePayload[] {
    return athleteIds.map((aId) => inputs.buildPayload(aId)).filter((p): p is ScorePayload => p !== null)
  }

  function heatAthleteIds(heatNum: number): number[] {
    return (byHeat[heatNum] ?? []).map((a) => a.athlete.id)
  }

  function allAthleteIds(): number[] {
    return workout.assignments.map((a) => a.athlete.id)
  }

  async function saveAllScores() {
    await detail.saveMany(payloadsFor(allAthleteIds()), 'All scores saved.')
  }

  async function saveHeat(heatNum: number) {
    await detail.saveMany(payloadsFor(heatAthleteIds(heatNum)), `Heat ${heatNum} scores saved.`)
  }

  async function completeHeat(heatNum: number) {
    await detail.completeHeat(heatNum, payloadsFor(heatAthleteIds(heatNum)))
  }

  async function calculate() {
    await detail.calculateRankings(payloadsFor(allAthleteIds()))
  }

  // HeatCard awaits this with no catch of its own, so a rejection here would
  // leave its row spinning. v1 could not reject — it called `fetch` and never
  // read `res.ok`, so a refused override silently reverted on the reload. The
  // failure is shown instead, the way the admin leaderboard shows its own.
  async function handlePointsOverride(athleteId: number, points: number) {
    try {
      await override.mutateAsync({ workoutId: Number(id), athleteId, points })
    } catch { /* surfaced through override.error below */ }
    await detail.load()
  }

  function generateJudges() {
    if (judges.assignments.length > 0) setPrompt('generateJudges')
    // The rejection exists for the ConfirmDialog path; here the hook's error
    // state is the surface, so the rejection is spent.
    else judges.generate(maxConsecutive).catch(() => {})
  }

  const status = statusBadge(workout.status)
  const between = workout.timeBetweenHeatsSecs
  const failure = detail.error || (override.error ? message(override.error) : '')
  const asked = prompt ? prompts[prompt] : null
  const locked = heatNums.length > 0 && !heatsUnlocked

  const heatItems: HeatSummary[] = heatNums.map((heatNum) => {
    const entries = byHeat[heatNum] ?? []
    const inHeat = new Set(entries.map((a) => a.athlete.id))
    return {
      number: heatNum,
      startLabel: workout.startTime
        ? fmtHeatTime(calcHeatStartMs(
            heatNum, workout.startTime, workout.heatIntervalSecs,
            workout.heatStartOverrides, workout.timeBetweenHeatsSecs,
          ))
        : null,
      athletes: entries.length,
      scored: workout.scores.filter((s) => inHeat.has(s.athleteId) && s.rawScore != null).length,
      complete: completedHeatNums.includes(heatNum),
    }
  })

  const generators = (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => detail.generateAssignments(false)}
        disabled={detail.loading || locked}
      >
        Generate (Random / Division Order)
      </Button>
      <Button
        size="sm"
        onClick={() => detail.generateAssignments(true)}
        disabled={detail.loading || locked}
      >
        Generate (By Cumulative Points)
      </Button>
      {locked && (
        <Button size="sm" variant="secondary" onClick={() => setPrompt('unlock')}>Unlock to Regenerate</Button>
      )}
    </>
  )

  return (
    <PageFrame
      title={`WOD ${workout.number}: ${workout.name}`}
      status={<Badge tone={status.tone}>{status.label}</Badge>}
      description={
        <Inline gap="tight" align="center" wrap>
          <Text variant="meta" tone="muted">
            {workout.lanes} lanes · {scoreTypeLabel(workout.scoreType)} · {workout.mixedHeats ? 'Mixed heats' : 'Separate heats'} · {Math.floor(between / 60)}m {between % 60 > 0 ? `${between % 60}s ` : ''}between heats
          </Text>
          {workout.startTime && (
            <Text variant="meta" tone="muted">Starts {new Date(workout.startTime).toLocaleString()}</Text>
          )}
        </Inline>
      }
      wide
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit Settings</Button>
          <WorkoutEquipmentPopover workoutId={id} slug={slug} />
          {workout.status === 'draft' && <Button size="sm" disabled={detail.loading} onClick={() => detail.setStatus('active')}>Activate</Button>}
          {workout.status === 'active' && <Button size="sm" variant="secondary" disabled={detail.loading} onClick={() => detail.setStatus('draft')}>Deactivate</Button>}
          {workout.status === 'completed' && <Button size="sm" disabled={detail.loading} onClick={() => detail.setStatus('active')}>Reactivate</Button>}
          {workout.status !== 'draft' && <Button size="sm" variant="warning" onClick={() => setPrompt('reset')}>Reset</Button>}
          <Button size="sm" variant="danger" onClick={() => setPrompt('delete')}>Delete</Button>
        </>
      }
    >
      {failure && <Notice tone="danger">Error: {failure}</Notice>}
      {judges.error && (
        <Notice tone="danger" onDismiss={judges.dismissError} dismissLabel="Dismiss judge error">
          {judges.error}
        </Notice>
      )}
      {!failure && detail.msg && <Notice tone="success">{detail.msg}</Notice>}

      {editing ? (
        <WorkoutEditForm
          workout={workout}
          loading={detail.loading}
          locations={locations.data ?? []}
          onSave={detail.updateSettings}
          onCancel={() => setEditing(false)}
        />
      ) : workout.description ? (
        <DataPanel title="Description" tone="sunken">
          <Text className={styles.description}>{workout.description}</Text>
        </DataPanel>
      ) : null}

      {heatNums.length === 0 ? (
        <EmptyState
          title="No heats yet"
          description="Best athletes are placed in the last heat. Existing assignments are replaced."
          action={<Inline gap="tight" wrap>{generators}</Inline>}
        />
      ) : (
        <div className={styles.panes}>
          <div className={styles.rail}>
            <Stack gap="section">
              <HeatRail items={heatItems} />

              {/* The tally lives beside the eyebrow, not in the button: the
                  label is already the widest thing in the rail, and a suffix
                  that grows with the athlete count is what used to clip it. */}
              <Stack gap="tight">
                <Inline gap="tight" align="center">
                  <Text variant="eyebrow" tone="muted">Scores</Text>
                  {scoredCount < totalAthletes && someScored && (
                    <Text variant="meta" tone="muted">{scoredCount}/{totalAthletes} scored</Text>
                  )}
                </Inline>
                <div className={styles.controls}>
                  <Button
                    size="sm"
                    onClick={calculate}
                    disabled={detail.loading || !someScored}
                    title={!someScored
                      ? 'Enter at least one score first'
                      : scoredCount < totalAthletes
                        ? `${totalAthletes - scoredCount} athlete(s) without scores will be unranked`
                        : ''}
                  >
                    Calculate Rankings &amp; Complete
                  </Button>
                  <Button size="sm" variant="secondary" onClick={saveAllScores} disabled={detail.loading}>
                    Save All Scores
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setPrompt('clearScores')}
                    disabled={detail.loading || workout.scores.length === 0}
                  >
                    Clear All Scores
                  </Button>
                </div>
              </Stack>

              <Stack gap="tight">
                <Text variant="eyebrow" tone="muted">Judges</Text>
                <div className={styles.controls}>
                  <Button
                    size="sm"
                    onClick={generateJudges}
                    disabled={judges.judges.length === 0}
                    title={judges.judges.length === 0 ? 'Add volunteers with a "Judge" role first' : undefined}
                  >
                    Auto-Assign Judges
                  </Button>
                  {judges.assignments.length > 0 && (
                    <Button variant="danger" size="sm" onClick={() => setPrompt('clearJudges')}>
                      Clear Judges
                    </Button>
                  )}
                </div>
              </Stack>

              <Stack gap="tight">
                <Text variant="eyebrow" tone="muted">Heat assignments</Text>
                <div className={styles.controls}>
                  {generators}
                </div>
                <Text variant="meta" tone="muted">
                  Best athletes are placed in the last heat. Existing assignments are replaced.
                </Text>
              </Stack>
            </Stack>
          </div>

          <div className={styles.heats}>
            <HeatDndProvider>
              <Stack gap="base">
                {heatNums.map((heatNum) => (
                  <section key={heatNum} id={`heat-${heatNum}`} aria-label={`Heat ${heatNum}`}>
                    <HeatCard
                      workout={workout}
                      heatNumber={heatNum}
                      entries={byHeat[heatNum] ?? []}
                      isComplete={completedHeatNums.includes(heatNum)}
                      loading={detail.loading}
                      scoreInputs={inputs}
                      onSaveHeat={saveHeat}
                      onCompleteHeat={completeHeat}
                      onUndoHeat={detail.undoHeat}
                      onReorder={detail.reorderAssignments}
                      onSaveHeatTime={detail.saveHeatTime}
                      isSaving={detail.savingHeats.has(heatNum)}
                      judges={judges.volunteers}
                      judgesByLane={judges.judgesByLane(heatNum)}
                      onJudgeChange={judges.setJudge}
                      onPointsOverride={handlePointsOverride}
                    />
                  </section>
                ))}
              </Stack>
            </HeatDndProvider>
          </div>
        </div>
      )}

      {workout.status === 'completed' && workout.scores.length > 0 && (
        <WorkoutLeaderboard workout={workout} />
      )}

      <ConfirmDialog<PromptKey>
        target={prompt}
        onClose={() => setPrompt(null)}
        onConfirm={(key) => prompts[key].run()}
        title={asked?.title ?? ''}
        description={asked?.description}
        confirmLabel={asked?.confirmLabel ?? ''}
        cancelLabel="Cancel"
        tone={asked?.tone}
      />
    </PageFrame>
  )
}
