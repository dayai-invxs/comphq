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
import { useIsCompetitionAdmin } from '@/lib/competitionRole'
import { calcHeatStartMs, fmtHeatTime } from '@/lib/heatTime'
import { scoreTypeLabel } from '@/lib/scoreTypes'
import { statusBadge } from '@/lib/workoutStatus'
import { HeatCard } from '../components/HeatCard/HeatCard'
import { HeatRail, type HeatSummary } from '../components/HeatRail/HeatRail'
import { HeatDndProvider } from '../components/heat-dnd-context'
import { WorkoutDescription } from '../components/WorkoutDescription/WorkoutDescription'
import { WorkoutEditForm } from '../components/WorkoutEditForm/WorkoutEditForm'
import { WorkoutEquipmentPopover } from '../components/WorkoutEquipmentPopover/WorkoutEquipmentPopover'
import { WorkoutLeaderboard } from '../components/WorkoutLeaderboard/WorkoutLeaderboard'
import { useKnockoutHeats } from '../useKnockoutHeats'
import { laneKey, useScoreInputs } from '../useScoreInputs'
import { useWorkoutDetail, type AnyScorePayload, type Assignment } from '../useWorkoutDetail'
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

type PromptKey =
  | 'unlock' | 'clearScores' | 'reset' | 'delete' | 'generateJudges' | 'clearJudges'
  | 'unlockFirst' | 'scoresFirst' | 'deleteHeat' | 'clearHeats' | 'undoRound'

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
  // A competition user (scorekeeper) runs the workout — scores, heats,
  // status, starting and running a knockout — and sees none of its setup:
  // settings, generating or unlocking heats, judges, clearing all scores,
  // reset.
  const isAdmin = useIsCompetitionAdmin()
  const navigate = useNavigate()
  const workoutsPath = `/${slug}/admin/workouts`

  const [editing, setEditing] = useState(false)
  const [heatsUnlocked, setHeatsUnlocked] = useState(false)
  const [prompt, setPrompt] = useState<PromptKey | null>(null)
  const [heatToDelete, setHeatToDelete] = useState<number | null>(null)

  const detail = useWorkoutDetail(id, { slug, onNotFound: () => navigate(workoutsPath) })
  const inputs = useScoreInputs(detail.workout)
  const judges = useWorkoutJudges(id, slug)
  const locations = useWorkoutLocations(slug)
  const settings = useSettings(slug)
  const override = useSetScorePoints(slug)
  const knockout = useKnockoutHeats(detail.workout, inputs, detail.setLaneAdvanced)

  // Member picks for split teams' lanes, shown at once and saved in the
  // background. A reload carries the saved picks, so these start over.
  const [memberPicks, setMemberPicks] = useState<Record<number, number | null>>({})

  // Re-hydrate input fields every time the workout reloads.
  useEffect(() => {
    setMemberPicks({})
    if (detail.workout) inputs.hydrate(detail.workout)
    // inputs.hydrate is stable (useCallback with []); depending on detail.workout identity is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.workout])

  const { byHeat, heatNums, scoredCount, totalAthletes, someScored, completedHeatNums, repeats } = useMemo(() => {
    const w = detail.workout
    if (!w) {
      return {
        byHeat: {}, heatNums: [], scoredCount: 0, totalAthletes: 0, someScored: false,
        completedHeatNums: [] as number[], repeats: new Map<number, number[]>(),
      }
    }
    // An import may place a team in more than one heat: a split team, scored
    // per lane and summed; the heat cards mark each of its rows. In a knockout
    // everyone is in a heat of every round they reach, which is not that.
    const heatsOf = new Map<number, number[]>()
    for (const a of w.assignments) heatsOf.set(a.athlete.id, [...(heatsOf.get(a.athlete.id) ?? []), a.heatNumber])
    const repeated = w.knockout
      ? new Map<number, number[]>()
      : new Map([...heatsOf].filter(([, hs]) => hs.length > 1).map(([id, hs]) => [id, hs.sort((x, y) => x - y)]))
    const grouped = w.assignments.reduce<Record<number, typeof w.assignments>>((acc, a) => {
      ;(acc[a.heatNumber] ??= []).push(a)
      return acc
    }, {})
    const nums = Object.keys(grouped).map(Number).sort((a, b) => a - b)
    // A knockout's results are per lane until the tournament is finished.
    const scored = w.knockout
      ? new Set(w.assignments.filter((a) => a.rawScore != null).map((a) => a.athlete.id)).size
      : w.scores.filter((s) => s.rawScore != null).length
    return {
      byHeat: grouped,
      heatNums: nums,
      scoredCount: scored,
      totalAthletes: heatsOf.size,
      someScored: scored > 0,
      completedHeatNums: w.completedHeats ?? [],
      repeats: repeated,
    }
  }, [detail.workout])

  const maxConsecutive = settings.data?.judgeMaxConsecutive ?? 3

  const prompts: Record<PromptKey, Prompt> = {
    unlock: {
      title: 'Unlock heats?',
      description: 'Unlocking lets you regenerate, delete or clear heats. Regenerating replaces all existing assignments, and athletes may be moved between heats.',
      confirmLabel: 'Unlock',
      tone: 'warning',
      run: async () => setHeatsUnlocked(true),
    },
    // A round with results (a finished final always has them): undoing it
    // deletes them, so it asks first. The rounds before it keep theirs.
    undoRound: {
      title: `Undo Round ${knockout.round}?`,
      description: `Round ${knockout.round}'s heats and the results entered in them are deleted, and any final placings with them. `
        + `Round ${knockout.round - 1} and its results stay, and the workout is reopened.`,
      confirmLabel: `Undo Round ${knockout.round}`,
      tone: 'danger',
      run: async () => { await detail.discardLatestRound() },
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
    unlockFirst: {
      title: 'Unlock heats first',
      description: 'Heats are locked. Click "Unlock to Regenerate" under Heat assignments, then try again.',
      confirmLabel: 'OK',
      tone: 'warning',
      run: async () => {},
    },
    scoresFirst: {
      title: 'This workout has scores',
      description: 'Heats can’t be deleted while the workout has scores. Use "Clear All Scores" first if you really mean to start over.',
      confirmLabel: 'OK',
      tone: 'warning',
      run: async () => {},
    },
    deleteHeat: {
      title: `Are you sure you want to delete Heat ${heatToDelete ?? ''}?`,
      description: 'This cannot be undone. Its athletes come out of the heat (they stay on the roster), and its judge assignments and completion are removed. Later heats keep their numbers and start times, leaving a gap. Any scores for these athletes would be lost.',
      confirmLabel: `Delete Heat ${heatToDelete ?? ''}`,
      tone: 'danger',
      run: async () => {
        if (heatToDelete == null) return
        await detail.deleteHeat(heatToDelete)
        setHeatsUnlocked(false)
      },
    },
    clearHeats: {
      title: 'Are you sure you want to clear all heats?',
      description: 'This cannot be undone. Every heat, lane assignment, judge assignment and heat completion for this workout is removed, and you will lose all scores. Athletes stay on the roster.',
      confirmLabel: 'Clear all heats',
      tone: 'danger',
      run: async () => { await detail.clearHeats(); setHeatsUnlocked(false) },
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

  // One payload per athlete/team. A team placed in more than one heat sends
  // the scores of its lanes among `entries`; the server adds up all its lanes.
  // A knockout sends every lane's own result.
  function payloadsFor(entries: Assignment[]): AnyScorePayload[] {
    const lanesOf = new Map<number, number[]>()
    for (const a of entries) lanesOf.set(a.athlete.id, [...(lanesOf.get(a.athlete.id) ?? []), a.id])
    return [...lanesOf]
      .map(([athleteId, laneIds]) => repeats.has(athleteId) || knockout.enabled
        ? inputs.buildLanePayload(athleteId, laneIds)
        : inputs.buildPayload(athleteId))
      .filter((p): p is AnyScorePayload => p !== null)
  }

  async function pickLaneMember(assignmentId: number, teamMemberId: number | null) {
    const had = assignmentId in memberPicks, prior = memberPicks[assignmentId]
    setMemberPicks((p) => ({ ...p, [assignmentId]: teamMemberId }))
    if (await detail.setLaneMember(assignmentId, teamMemberId)) return
    // Refused: put back what this lane showed before (the error is in the banner).
    setMemberPicks((p) => {
      const next = { ...p }
      if (had) next[assignmentId] = prior
      else delete next[assignmentId]
      return next
    })
  }

  async function saveAllScores() {
    await detail.saveMany(payloadsFor(workout.assignments), 'All scores saved.')
  }

  async function saveHeat(heatNum: number) {
    await detail.saveMany(payloadsFor(byHeat[heatNum] ?? []), `Heat ${heatNum} scores saved.`)
  }

  // The score boxes one lane fills: its own for a split team or a knockout,
  // else the athlete's.
  const keyOf = (a: Assignment) => (repeats.has(a.athlete.id) || knockout.enabled ? laneKey(a.id) : a.athlete.id)
  // Typed counts as well as saved: Calculate saves before it ranks.
  const someEntered = someScored || workout.assignments.some((a) => inputs.buildPayload(keyOf(a)) !== null)

  // Completing a heat saves its scores and, with them, any score typed into
  // another heat and not saved yet — completing one heat must never cost the
  // scores waiting in the next. The other heats' saved scores are not resent.
  async function completeHeat(heatNum: number) {
    const others = workout.assignments.filter((a) => a.heatNumber !== heatNum && inputs.isUnsaved(keyOf(a)))
    await detail.completeHeat(heatNum, payloadsFor([...(byHeat[heatNum] ?? []), ...others]))
  }

  // Saves every entered score, completes every heat (the server does that as
  // it calculates), and ranks the workout.
  async function calculate() {
    await detail.calculateRankings(payloadsFor(workout.assignments))
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

  // Deleting heats is guarded twice before the "are you sure": the heats must
  // be unlocked, and the workout must have no scores (the server refuses too).
  function askToDeleteHeats(key: 'deleteHeat' | 'clearHeats', heatNum?: number) {
    if (!heatsUnlocked) { setPrompt('unlockFirst'); return }
    if (hasScores) { setPrompt('scoresFirst'); return }
    setHeatToDelete(heatNum ?? null)
    setPrompt(key)
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
  // Lane results count: a knockout's rounds keep theirs before any score row.
  const hasScores = workout.scores.length > 0 || workout.assignments.some((a) => a.rawScore != null)
  const heatsOfRound = (r: number) => workout.assignments.filter((a) => (a.round ?? 1) === r)
  const stageName = (r: number) => (r >= knockout.rounds ? 'the Final' : `Round ${r}`)
  // Saved results in the latest round: a score or an advance tick.
  const latestHasResults = heatsOfRound(knockout.round).some((a) => a.rawScore != null || a.advanced != null)

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
      scored: knockout.enabled
        ? entries.filter((a) => a.rawScore != null).length
        : workout.scores.filter((s) => inHeat.has(s.athleteId) && s.rawScore != null).length,
      complete: completedHeatNums.includes(heatNum),
    }
  })

  const knockoutControls = (
    <>
      {(heatNums.length === 0 || !locked) && (
        <Button size="sm" onClick={() => detail.runKnockout('start')} disabled={detail.loading || locked}>
          {heatNums.length === 0 ? 'Start Tournament' : 'Restart Tournament'}
        </Button>
      )}
      {knockout.round > 0 && knockout.round < knockout.rounds && (
        <Button
          size="sm"
          onClick={() => detail.runKnockout('advance', payloadsFor(heatsOfRound(knockout.round)))}
          disabled={detail.loading || knockout.problems.length > 0}
          title={knockout.problems.length ? 'Settle every heat first' : undefined}
        >
          Complete Round {knockout.round} → {stageName(knockout.round + 1)}
        </Button>
      )}
      {knockout.round > 0 && knockout.round >= knockout.rounds && (
        <Button size="sm" onClick={() => detail.runKnockout('finish', payloadsFor(heatsOfRound(knockout.round)))} disabled={detail.loading}>
          Finish Tournament
        </Button>
      )}
      {/* With results in the round, undoing it deletes them: the admin's,
          behind a warning. An empty round is undone at once, by anyone. */}
      {knockout.round > 1 && (!latestHasResults || isAdmin) && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => (latestHasResults ? setPrompt('undoRound') : detail.runKnockout('undo'))}
          disabled={detail.loading}
        >
          Undo Round {knockout.round}
        </Button>
      )}
      {isAdmin && heatNums.length > 0 && (
        <Button
          size="sm"
          variant={locked ? 'primary' : 'danger'}
          onClick={() => askToDeleteHeats('clearHeats')}
          disabled={detail.loading || locked}
        >
          Clear All Heats
        </Button>
      )}
      {isAdmin && locked && (
        <Button size="sm" variant="secondary" onClick={() => setPrompt('unlock')}>Unlock to Restart</Button>
      )}
    </>
  )

  const generators = knockout.enabled ? knockoutControls : !isAdmin ? null : (
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
      {heatNums.length > 0 && (
        <Button
          size="sm"
          variant={locked ? 'primary' : 'danger'}
          onClick={() => askToDeleteHeats('clearHeats')}
          disabled={detail.loading || locked}
        >
          Clear All Heats
        </Button>
      )}
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
            {workout.lanes} lanes · {knockout.enabled
              ? `Knockout (${scoreTypeLabel(workout.scoreType)}), ${knockout.rounds} rounds, top ${workout.knockoutAdvance ?? 1} per heat advance`
              : scoreTypeLabel(workout.scoreType)} · {workout.mixedHeats ? 'Mixed heats' : 'Separate heats'} · {Math.floor(between / 60)}m {between % 60 > 0 ? `${between % 60}s ` : ''}between heats
          </Text>
          {workout.startTime && (
            <Text variant="meta" tone="muted">Starts {new Date(workout.startTime).toLocaleString()}</Text>
          )}
        </Inline>
      }
      wide
      actions={
        <>
          {isAdmin && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit Settings</Button>}
          {isAdmin && <WorkoutEquipmentPopover workoutId={id} slug={slug} />}
          {workout.status === 'draft' && <Button size="sm" disabled={detail.loading} onClick={() => detail.setStatus('active')}>Activate</Button>}
          {workout.status === 'active' && <Button size="sm" variant="secondary" disabled={detail.loading} onClick={() => detail.setStatus('draft')}>Deactivate</Button>}
          {workout.status === 'completed' && <Button size="sm" disabled={detail.loading} onClick={() => detail.setStatus('active')}>Reactivate</Button>}
          {isAdmin && workout.status !== 'draft' && <Button size="sm" variant="warning" onClick={() => setPrompt('reset')}>Reset</Button>}
          {isAdmin && <Button size="sm" variant="danger" onClick={() => setPrompt('delete')}>Delete</Button>}
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

      {editing && isAdmin ? (
        <WorkoutEditForm
          workout={workout}
          loading={detail.loading}
          locations={locations.data ?? []}
          onSave={detail.updateSettings}
          onCancel={() => setEditing(false)}
        />
      ) : workout.description ? (
        <DataPanel title="Description" tone="sunken">
          <WorkoutDescription text={workout.description} />
        </DataPanel>
      ) : null}

      {heatNums.length === 0 ? (
        <EmptyState
          title="No heats yet"
          description={!isAdmin && !knockout.enabled
            ? 'A competition admin sets the heats up. They appear here once they have.'
            : knockout.enabled
            ? 'Round 1 places everyone, each division seeded by the overall leaderboard and spread across heats.'
            : 'Best athletes are placed in the last heat. Existing assignments are replaced.'}
          action={isAdmin || knockout.enabled ? <Inline gap="tight" wrap>{generators}</Inline> : undefined}
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
                  {!knockout.enabled && <Button
                    size="sm"
                    onClick={calculate}
                    disabled={detail.loading || !someEntered}
                    title={!someEntered
                      ? 'Enter at least one score first'
                      : 'Saves every entered score, completes every heat and ranks the workout'}
                  >
                    Calculate Rankings &amp; Complete
                  </Button>}
                  <Button size="sm" variant="secondary" onClick={saveAllScores} disabled={detail.loading}>
                    Save All Scores
                  </Button>
                  {isAdmin && <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setPrompt('clearScores')}
                    disabled={detail.loading || !hasScores}
                  >
                    Clear All Scores
                  </Button>}
                </div>
              </Stack>

              {isAdmin && <Stack gap="tight">
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
              </Stack>}

              <Stack gap="tight">
                <Text variant="eyebrow" tone="muted">
                  {knockout.enabled
                    ? knockout.round > 0 ? `Knockout · Round ${knockout.round} of ${knockout.rounds}` : 'Knockout'
                    : 'Heat assignments'}
                </Text>
                {knockout.problems.map((p) => <Text key={p} variant="meta" tone="warning">{p}</Text>)}
                <div className={styles.controls}>
                  {generators}
                </div>
                <Text variant="meta" tone="muted">
                  {!isAdmin && !knockout.enabled
                    ? 'A competition admin generates and changes the heats.'
                    : knockout.enabled
                    ? `The top ${workout.knockoutAdvance ?? 1} of each heat advance by score. Tick or untick Advances to decide by hand. Completing a round saves the scores typed.`
                    : 'Best athletes are placed in the last heat. Existing assignments are replaced.'}
                </Text>
              </Stack>
            </Stack>
          </div>

          <div className={styles.heats}>
            <HeatDndProvider>
              <Stack gap="base">
                {repeats.size > 0 && (
                  <Text variant="meta" tone="warning" role="status">
                    {repeats.size === 1 ? '1 athlete/team is' : `${repeats.size} athletes/teams are`} placed
                    in more than one heat (highlighted below). Each lane is scored on its own, and the
                    team&apos;s score is the lanes added together once every lane has a score.
                  </Text>
                )}
                {heatNums.map((heatNum, i) => {
                  const entries = byHeat[heatNum] ?? []
                  const heatRound = entries[0]?.round ?? 1
                  const prevRound = i > 0 ? (byHeat[heatNums[i - 1]]?.[0]?.round ?? 1) : null
                  return (
                  <section key={heatNum} id={`heat-${heatNum}`} aria-label={`Heat ${heatNum}`}>
                    {knockout.enabled && heatRound !== prevRound && (
                      <Text variant="eyebrow" tone="muted" className={styles.roundHeading}>
                        {heatRound >= knockout.rounds ? 'Final' : `Round ${heatRound}`}
                      </Text>
                    )}
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
                      onDeleteHeat={isAdmin ? (n) => askToDeleteHeats('deleteHeat', n) : undefined}
                      deleteLocked={locked}
                      onReorder={isAdmin ? detail.reorderAssignments : undefined}
                      onSaveHeatTime={isAdmin ? detail.saveHeatTime : undefined}
                      isSaving={detail.savingHeats.has(heatNum)}
                      judges={judges.volunteers}
                      judgesByLane={judges.judgesByLane(heatNum)}
                      onJudgeChange={isAdmin ? judges.setJudge : undefined}
                      onPointsOverride={handlePointsOverride}
                      repeats={repeats}
                      laneMember={(a) => (a.id in memberPicks ? memberPicks[a.id] : a.teamMemberId ?? null)}
                      onLaneMemberChange={pickLaneMember}
                      knockout={knockout.heat(entries)}
                    />
                  </section>
                  )
                })}
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
