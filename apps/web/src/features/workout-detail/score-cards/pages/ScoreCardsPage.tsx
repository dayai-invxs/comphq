import { Button, EmptyState, Input, Select, Spinner } from '@mond-design-system/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMyCompetitions } from '@/api/competitions'
import { useLogo } from '@/api/logo'
import { queryKeys } from '@/api/queryKeys'
import { useSettings } from '@/api/settings'
import { Centered } from '@/components/Centered/Centered'
import { parseScoreCard, unansweredRepDefinitions, type ScoreCardSpec } from '@/lib/scoreCard'
import type { Workout } from '@/features/workout-detail/useWorkoutDetail'
import { buildWorkoutMutations } from '@/features/workout-detail/useWorkoutDetail.mutations'
import { ScoreCard } from '../components/ScoreCard/ScoreCard'
import { blankCards, laneCards, sheets } from '../cards'
import styles from './ScoreCardsPage.module.css'

// The judges' score cards for one workout, two to a letter sheet, ready for
// the browser's print dialog. Outside the admin frame, like the TV: the page
// is the paper. The controls sit above the sheets and never print.
//
//   ?heat=3        one heat's lanes (absent: every heat)
//   ?blank=12&version=1   12 blank cards from version 1 (a knockout round,
//                  or a workout the leaderboard seeds later)

const MAX_BLANK = 200

export function ScoreCardsPage() {
  const { slug = '', id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const api = useMemo(() => buildWorkoutMutations(id, slug), [id, slug])
  const workoutQuery = useQuery({
    queryKey: queryKeys.workout(slug, id),
    queryFn: () => api.load<Workout>(),
    enabled: !!slug && !!id,
    retry: false,
  })
  const settings = useSettings(slug)
  const comps = useMyCompetitions(true)
  const logo = useLogo(slug)

  const workout = workoutQuery.data
  const parsed = useMemo(() => (workout?.scoreCard ? parseScoreCard(workout.scoreCard) : null), [workout?.scoreCard])
  const spec: ScoreCardSpec | null = parsed?.ok ? parsed.spec : null

  const blankCount = Math.min(MAX_BLANK, Math.max(0, Number(params.get('blank')) || 0))
  const versionParam = params.get('version')
  const versionIdx = Math.min(Math.max(0, Number(versionParam) || 0), (spec?.versions.length ?? 1) - 1)
  const heatParam = params.get('heat')
  const heat = heatParam ? Number(heatParam) : null

  const cards = useMemo(() => {
    if (!workout) return []
    const origin = window.location.origin
    if (blankCount > 0) return blankCards(workout, spec, { slug, origin, count: blankCount, version: versionIdx })
    return laneCards(workout, spec, {
      slug, origin, showBib: !!settings.data?.showBib, heats: heat ? [heat] : undefined,
      version: versionParam == null ? undefined : versionIdx,
    })
  }, [workout, spec, slug, blankCount, versionIdx, versionParam, heat, settings.data?.showBib])

  if (workoutQuery.isPending || settings.isPending) return <Centered><Spinner label="Loading" /></Centered>
  if (!workout) return <Centered><EmptyState title="Workout not found" description="It may have been deleted." /></Centered>

  const competitionName = comps.data?.find((c) => c.slug === slug)?.name ?? ''
  const heats = [...new Set(workout.assignments.map((a) => a.heatNumber))].sort((a, b) => a - b)
  const missing = spec ? unansweredRepDefinitions(spec) : []
  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link to={`/${slug}/admin/workouts/${workout.id}`}>← Event {workout.number}</Link>
        <strong>{workout.name} · score cards</strong>
        <Select
          size="sm"
          aria-label="Cards for"
          value={blankCount > 0 ? 'blank' : heat ? String(heat) : 'all'}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'blank') set({ blank: String(blankCount || 10), heat: null })
            else set({ blank: null, heat: v === 'all' ? null : v })
          }}
        >
          <option value="all">Every heat ({workout.assignments.length} lanes)</option>
          {heats.map((h) => <option key={h} value={h}>Heat {h}</option>)}
          <option value="blank">Blank cards</option>
        </Select>
        {blankCount > 0 && (
          <>
            <Input
              size="sm"
              type="number"
              min={1}
              max={MAX_BLANK}
              aria-label="How many blank cards"
              value={String(blankCount)}
              onChange={(e) => set({ blank: String(Math.max(1, Math.min(MAX_BLANK, Number(e.target.value) || 1))) })}
              className={styles.count}
            />
          </>
        )}
        {spec && spec.versions.length > 1 && (
          <Select
            size="sm"
            aria-label="Card version"
            value={versionParam == null && blankCount === 0 ? 'auto' : String(versionIdx)}
            onChange={(e) => set({ version: e.target.value === 'auto' ? null : e.target.value })}
          >
            {blankCount === 0 && <option value="auto">Each lane’s own card</option>}
            {spec.versions.map((v, i) => <option key={i} value={i}>{v.label}</option>)}
          </Select>
        )}
        <span className={styles.grow} />
        <span className={styles.tally}>{cards.length} card{cards.length === 1 ? '' : 's'} · {Math.ceil(cards.length / 2)} sheet{cards.length > 2 ? 's' : ''}</span>
        <Button size="sm" onClick={() => window.print()} disabled={cards.length === 0 || missing.length > 0}>Print</Button>
      </div>
      {parsed && !parsed.ok && (
        <p className={styles.notice}>The saved score card doesn’t pass its checks, so plain cards are shown. Fix it on the workout page.</p>
      )}
      {missing.length > 0 && (
        <p className={styles.notice}>Printing waits on: {missing.map((d) => d.question ?? d.movement).join(' · ')} Answer on the workout page.</p>
      )}
      {cards.length === 0 && (
        <p className={styles.notice}>No lanes yet. Place athletes in heats, or print blank cards.</p>
      )}
      {sheets(cards).map((pair) => (
        <section key={pair[0].key} className={styles.sheet}>
          {pair.map((card) => (
            <ScoreCard
              key={card.key}
              card={card}
              workout={workout}
              spec={spec}
              competitionName={competitionName}
              logoUrl={logo.data?.url}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
