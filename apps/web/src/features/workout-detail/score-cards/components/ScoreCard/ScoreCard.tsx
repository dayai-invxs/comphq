import { QRCodeSVG } from 'qrcode.react'
import type { CSSProperties, ReactNode } from 'react'
import type { ScoreCardItem, ScoreCardPart, ScoreCardSpec, ScoreCardVersion } from '@/lib/scoreCard'
import { amountLabel, boxesFor, fmtMF, levelSwaps, type Box, type Defs, type Gender } from '../../boxes'
import type { CardData } from '../../cards'
import styles from './ScoreCard.module.css'

// One printed judge's card: half-letter, 5.5 × 8.5 in. Drawn from three
// things: the workout's structure (movements and boxes), the workout's own
// settings (score type, tiebreak, Part B) and the lane (who, heat, lane).
// With no structure it is a plain card: who, and the score boxes.
//
// Never printed: the workout's full description or the judge's name.

export type CardWorkout = {
  id: number
  number: number
  name: string
  scoreType: string
  tiebreakEnabled: boolean
  tiebreakScoreType: string
  tiebreakBestLane?: boolean
  partBEnabled: boolean
  knockout?: boolean
}

type Props = {
  card: CardData
  workout: CardWorkout
  spec: ScoreCardSpec | null
  competitionName: string
  logoUrl?: string | null
}

const SCORE_LABEL: Record<string, string> = {
  time: 'Finish time', rounds_reps: 'Rounds', weight: 'Total lb', higher_is_better: 'Total reps', lower_is_better: 'Score',
}

export function ScoreCard({ card, workout, spec, competitionName, logoUrl }: Props) {
  const version = spec?.versions[card.version] ?? null
  const defs: Defs = Object.fromEntries((spec?.repDefinitions ?? []).map((d) => [d.key, d]))
  const missing = (spec?.repDefinitions ?? []).filter((d) => d.value == null)
  const g = card.entrant.gender
  const cap = version?.cap ?? spec?.cap
  const capLabel = !cap ? null : cap.toLowerCase() === 'none' ? 'No cap' : `Cap ${cap}`
  const ctx: Ctx = { g, defs, cap: cap ?? null, version, teamSize: spec?.team?.size ?? card.entrant.roster?.length ?? 1 }

  return (
    <article className={styles.card} aria-label={`Score card: ${card.entrant.name ?? 'blank'}, Event ${workout.number}`}>
      {missing.length > 0 && (
        <div className={styles.blocked}>
          Can’t print yet: {missing.map((d) => `${d.movement.toLowerCase()} needs a rep value`).join('; ')}.
        </div>
      )}

      <header className={logoUrl ? styles.top : `${styles.top} ${styles.noLogo}`}>
        {logoUrl && <img className={styles.logo} src={logoUrl} alt="" />}
        <div>
          <div className={styles.comp}>{competitionName}</div>
          <div className={styles.event}>Event {workout.number} · {workout.name}</div>
          <div className={styles.meta}>
            {card.blank ? (
              <>
                <span><b>Heat</b> <i className={styles.write} /></span>
                <span><b>Lane</b> <i className={styles.write} /></span>
              </>
            ) : (
              <>
                <span><b>Heat</b> {card.heat}</span>
                <span><b>Lane</b> {card.lane}</span>
                {card.start && <span><b>Start</b> {card.start}</span>}
              </>
            )}
            {capLabel && <span><b>{capLabel}</b></span>}
            {workout.knockout && version && <span><b>{version.label}</b></span>}
          </div>
        </div>
      </header>

      <Who card={card} spec={spec} />
      {card.entrant.roster && <Roster roster={card.entrant.roster} spec={spec} blank={card.blank} />}

      {version && <Loads version={version} g={g} />}
      {version?.parts.map((part, i) => <Part key={i} part={part} ctx={ctx} />)}

      <Notes spec={spec} version={version} workout={workout} />
      <ScoreBlock card={card} workout={workout} version={version} />
    </article>
  )
}

type Ctx = { g: Gender | null; defs: Defs; cap: string | null; version: ScoreCardVersion | null; teamSize: number }

function Who({ card, spec }: { card: CardData; spec: ScoreCardSpec | null }) {
  const e = card.entrant
  const perAthleteLevel = spec?.team?.levelChoice === 'perAthlete' && !e.roster
  const isTeam = !!e.roster || !!spec?.team
  const sub = [e.team, e.division].filter(Boolean).join(' · ')
  return (
    <div className={e.bib ? styles.who : `${styles.who} ${styles.noBib}`}>
      <div className={styles.whoMain}>
        {card.blank ? (
          <>
            <div className={styles.writeLine}><span>{e.team != null ? 'Athlete' : isTeam ? 'Team' : 'Athlete'}</span><i /></div>
            {e.team != null && <div className={styles.writeLine}><span>Team</span><i /></div>}
            <div className={styles.writeLine}><span>Division</span><i /></div>
          </>
        ) : (
          <>
            {e.name
              ? <div className={styles.name}>{e.name}</div>
              : <div className={styles.writeLine}><span>Athlete</span><i /></div>}
            {sub && <div className={styles.div}>{sub}</div>}
          </>
        )}
        {perAthleteLevel && (
          <div className={styles.lvl}>Level <LevelBoxes /> <span>mark one</span></div>
        )}
      </div>
      {e.bib && <div className={styles.bib}><span>Bib</span><strong>{e.bib}</strong></div>}
    </div>
  )
}

function LevelBoxes() {
  return <span className={styles.lv}><span>RX</span><span>INT</span><span>SC</span></span>
}

function Roster({ roster, spec, blank }: { roster: { name: string; gender: Gender | null }[]; spec: ScoreCardSpec | null; blank: boolean }) {
  const order = spec?.team?.order
  const levels = spec?.team?.levelChoice === 'perAthlete'
  return (
    <div className={styles.roster}>
      <div className={styles.rh}>
        <span>{order === 'letters' ? 'Write A, B, C' : order === 'numbers' ? 'Write 1, 2, 3 in tag order' : 'Team'}</span>
        {levels && <span>Mark each level</span>}
      </div>
      {roster.map((m, i) => (
        <div key={i} className={styles.r}>
          {order ? <span className={styles.ord} /> : <span />}
          {blank || !m.name
            ? <span className={styles.blankName} />
            : <span>{m.name} {m.gender && <em>{m.gender.toUpperCase()}</em>}</span>}
          {levels ? <LevelBoxes /> : <span />}
        </div>
      ))}
    </div>
  )
}

function Loads({ version, g }: { version: ScoreCardVersion; g: Gender | null }) {
  const own = Array.isArray(version.loads) ? version.loads : version.loads ? (g ? version.loads[g] : [...version.loads.m]) : []
  const fromItems = version.parts.flatMap((p) => ('items' in p ? p.items : []))
    .filter((i) => i.load)
    .map((i) => `${i.movement}: ${g ? i.load![g] : i.load!.m === i.load!.f ? i.load!.m : `${i.load!.m} / ${i.load!.f}`}`)
  const loads = [...new Set([...own, ...fromItems])]
  if (loads.length === 0) return null
  return <div className={styles.loads}>{loads.map((l) => <span key={l}>{l}</span>)}</div>
}

function Boxes({ boxes, small, wide }: { boxes: Box[]; small?: boolean; wide?: boolean }) {
  return (
    <div className={styles.cells}>
      {boxes.map((b, i) => (
        <div key={i} className={[styles.cell, small && styles.sm, wide && styles.whole].filter(Boolean).join(' ')}>
          <b>{b.big}</b>
          {b.total != null && <small>{b.total}</small>}
        </div>
      ))}
    </div>
  )
}

/** The movement's name after its amount: "20 cal Row", not "20 cal Cal Row". */
function bare(item: ScoreCardItem): string {
  return item.unit === 'cal' && item.amount ? item.movement.replace(/^cal\s+/i, '') : item.movement
}

function MovementLabel({ item, g, round = 1, short }: { item: ScoreCardItem; g: Gender | null; round?: number; short?: boolean }) {
  const amt = amountLabel(item, g, round)
  return (
    <div className={styles.mv}>
      {amt && <b>{amt} </b>}{bare(item)}
      {!short && levelSwaps(item, g, round).map((s) => <em key={s}>{s}</em>)}
      {!short && item.lines && <em>{item.lines.filter((l) => l).join(' · ')} ft lines</em>}
      {!short && item.note && <em>{item.note}</em>}
    </div>
  )
}

function Row({ children, tb, lead }: { children: ReactNode; tb?: boolean; lead?: ReactNode }) {
  return (
    <div className={lead !== undefined ? `${styles.row} ${styles.withLead}` : styles.row}>
      {lead !== undefined && <div className={styles.rn}>{lead}</div>}
      {children}
      {tb ? <div className={styles.tb}>TB <i /></div> : <div />}
    </div>
  )
}

function Part({ part, ctx }: { part: ScoreCardPart; ctx: Ctx }) {
  switch (part.kind) {
    case 'sequence': return <Sequence part={part} ctx={ctx} />
    case 'ladder': return <Ladder part={part} ctx={ctx} />
    case 'lift': return <Lift part={part} />
    case 'windows': return <Windows part={part} ctx={ctx} />
    case 'emom': return <Emom part={part} ctx={ctx} />
    case 'relay': return <Relay part={part} ctx={ctx} />
  }
}

type PartOf<K extends ScoreCardPart['kind']> = Extract<ScoreCardPart, { kind: K }>

function Title({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return <div className={styles.partTitle}>{children}{note && <small>{note}</small>}</div>
}

function Sequence({ part, ctx }: { part: PartOf<'sequence'>; ctx: Ctx }) {
  let total: number | null = 0
  return (
    <div className={styles.grid}>
      <Title note={[ctx.cap && ctx.cap.toLowerCase() !== 'none' ? `Cap ${ctx.cap}` : null, 'grey = total reps so far'].filter(Boolean).join(' · ')}>
        {part.title ?? 'For time'}
      </Title>
      {part.items.map((item, i) => {
        const r = boxesFor(item, total, ctx.defs, { g: ctx.g })
        total = r.total
        return (
          <Row key={i} tb={item.tiebreakMark}>
            <MovementLabel item={item} g={ctx.g} />
            <Boxes boxes={r.boxes} wide={item.box === 'whole' || item.box === 'lines'} />
          </Row>
        )
      })}
    </div>
  )
}

function Ladder({ part, ctx }: { part: PartOf<'ladder'>; ctx: Ctx }) {
  const rounds = (ctx.version?.estimatedRounds ?? 5) + 1
  // The rep size of a distance is stated once here, not every round.
  const sizes = part.items
    .filter((i) => i.unit === 'ft' && i.repDef && ctx.defs[i.repDef]?.value)
    .map((i) => `${i.movement}: 1 rep = ${ctx.defs[i.repDef!].value} ft`)
  const grows = part.items.filter((i) => i.step)
    .map((i) => `${fmtMF(i.step!, ctx.g)}${i.unit === 'ft' ? ' ft' : ''} ${i.movement.toLowerCase()}`)
  const title = part.title ?? (ctx.cap && ctx.cap.toLowerCase() !== 'none' ? `AMRAP ${ctx.cap.replace(/:00$/, '')} min` : 'AMRAP')
  return (
    <div className={`${styles.grid} ${styles.ladder}`}>
      <Title note={[...sizes, 'grey = reps into this round'].join(' · ')}>{title}</Title>
      {Array.from({ length: rounds }, (_, k) => {
        const round = k + 1
        let total: number | null = 0
        return part.items.map((item, i) => {
          const r = boxesFor(item, total, ctx.defs, { g: ctx.g, round })
          total = r.total
          return (
            <Row key={`${round}-${i}`} tb={item.tiebreakMark} lead={i === 0 ? `R${round}` : ''}>
              <MovementLabel item={item} g={ctx.g} round={round} short />
              <Boxes boxes={r.boxes} wide={item.box === 'whole'} />
            </Row>
          )
        })
      })}
      {grows.length > 0 && (
        <div className={styles.more}>Past round {rounds}? Keep counting on the back: each round adds {grows.join(' and ')}.</div>
      )}
    </div>
  )
}

function Lift({ part }: { part: PartOf<'lift'> }) {
  return (
    <div className={styles.grid}>
      <Title note={`${part.lift} · best ${part.count} added`}>{part.title ?? part.lift}</Title>
      <div className={styles.attempts}>
        {Array.from({ length: part.attempts }, (_, i) => <div key={i} className={styles.attempt}>#{i + 1}</div>)}
      </div>
    </div>
  )
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function Windows({ part, ctx }: { part: PartOf<'windows'>; ctx: Ctx }) {
  const counted = part.items.filter((i) => i.box !== 'entry')
  const entry = part.items.find((i) => i.box === 'entry')
  const count = part.rotation.length * part.perAthlete
  const head = (i: ScoreCardItem) => {
    const sc = i.levels?.Sc
    return (
      <span>
        <b>{amountLabel(i, ctx.g)} {bare(i).toLowerCase()}</b>
        {sc && `Sc ${sc.amount ? fmtMF(sc.amount, ctx.g) : ''} ${(sc.movement ?? '').toLowerCase()}`.trim()}
      </span>
    )
  }
  return (
    <div className={styles.grid}>
      <Title note={`${part.rotation.join(' → ')}, ${part.perAthlete} each${ctx.cap ? ` · cap ${ctx.cap}` : ''}`}>
        {part.title ?? `${count} windows of ${clock(part.windowSecs)}`}
      </Title>
      <div className={`${styles.win} ${styles.winHead}`} style={{ '--counted': counted.length } as CSSProperties}>
        <span /><span>Athlete</span>
        {counted.map((i, k) => <div key={k}>{head(i)}</div>)}
        {entry && <span><b>{entry.movement}</b>{(entry.entry ?? []).join(' × ')}{entry.product ? ' = total' : ''}</span>}
      </div>
      {Array.from({ length: count }, (_, i) => {
        const first = i % part.rotation.length === 0
        return (
          <div key={i} className={first ? `${styles.win} ${styles.first}` : styles.win} style={{ '--counted': counted.length } as CSSProperties}>
            <div className={styles.rn}>{first ? `R${i / part.rotation.length + 1}` : ''}</div>
            <div className={styles.wl}><b>{part.rotation[i % part.rotation.length]}</b><small>{clock(i * part.windowSecs)}</small></div>
            {counted.map((item, k) => (
              <Boxes
                key={k}
                boxes={item.box === 'whole'
                  ? [{ big: item.movement.toLowerCase().replace(/^cal /, ''), total: null }]
                  : boxesFor(item, 0, ctx.defs, { g: ctx.g, noTotal: true }).boxes}
                wide={item.box === 'whole'}
              />
            ))}
            {entry && (
              <div className={styles.entry}>
                {(entry.entry ?? []).map((u, k) => (
                  <span key={k}>{k > 0 && '×'} <i className={u === 'reps' ? styles.repsBox : undefined} /></span>
                ))}
                {entry.product && <>= <i className={styles.wideBox} /></>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Emom({ part, ctx }: { part: PartOf<'emom'>; ctx: Ctx }) {
  const minutes = part.estimatedMinutes + 1
  let total: number | null = 0
  const repsAt = (m: number) => part.startReps + part.step * (m - 1)
  return (
    <div className={`${styles.grid} ${styles.emom}`} style={{ '--items': part.items.length } as CSSProperties}>
      <Title note="Until a minute isn’t finished · grey = this athlete’s total">
        {part.title ?? `Every minute, +${part.step} rep${part.step === 1 ? '' : 's'} each`}
      </Title>
      <div className={`${styles.row} ${styles.emomHead}`}>
        <span>Min</span>
        {part.items.map((i, k) => (
          <span key={k}><b>{i.movement}</b>{i.levels?.Sc?.movement && ` · Sc ${i.levels.Sc.movement.toLowerCase()}`}</span>
        ))}
      </div>
      {Array.from({ length: minutes }, (_, k) => {
        const m = k + 1
        return (
          <div key={m} className={styles.row}>
            <div className={styles.rn}>{m}</div>
            {part.items.map((item, i) => {
              const r = boxesFor(item, total, ctx.defs, { g: ctx.g, reps: repsAt(m) })
              total = r.total
              return <Boxes key={i} boxes={r.boxes} small />
            })}
          </div>
        )
      })}
      <div className={styles.more}>
        Past minute {minutes}? Keep counting on the back: minute {minutes + 1} is {part.items.map(() => repsAt(minutes + 1)).join(' + ')}.
      </div>
    </div>
  )
}

function Relay({ part, ctx }: { part: PartOf<'relay'>; ctx: Ctx }) {
  // The level swaps are the same for every athlete, so they're stated once.
  const swaps = part.items
    .filter((i) => i.levels?.Int || i.levels?.Sc)
    .map((i) => `${bare(i)}: ${levelSwaps(i, null).join(', ')}`)
  let total: number | null = 0
  return (
    <div className={`${styles.grid} ${styles.relay}`}>
      <Title note={part.resetTotalEachAthlete ? 'grey = this athlete’s reps' : 'grey = team total so far'}>
        {part.title ?? ctx.version?.stage ?? ctx.version?.label ?? 'Relay'}
      </Title>
      <div className={styles.notes}>
        {swaps.map((s) => <span key={s}>{s}</span>)}
        {part.tag && <span>Each athlete: {part.tag.charAt(0).toLowerCase()}{part.tag.slice(1)}.</span>}
      </div>
      {Array.from({ length: ctx.teamSize }, (_, k) => {
        const n = k + 1
        if (part.resetTotalEachAthlete) total = 0
        return (
          <div key={n}>
            <div className={styles.legHead}>
              <b>Athlete {n}</b>
              <small>{n === 1 ? 'starts on the clock' : `starts on athlete ${n - 1}’s tag`}</small>
            </div>
            {part.items.map((item, i) => {
              const r = boxesFor(item, total, ctx.defs, { g: ctx.g })
              total = r.total
              return (
                <Row key={i}>
                  <MovementLabel item={item} g={ctx.g} short />
                  <Boxes boxes={r.boxes} />
                </Row>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function Notes({ spec, version, workout }: { spec: ScoreCardSpec | null; version: ScoreCardVersion | null; workout: CardWorkout }) {
  const hasMachine = !!version?.parts.some((p) => 'items' in p && p.items.some((i) => i.box === 'whole' && i.unit === 'cal'))
  const notes = [
    ...(spec?.notes ?? []),
    ...(hasMachine ? ['Capped partway through a machine: write the number reached in its box.'] : []),
    ...(version?.tiebreak && workout.tiebreakEnabled && !workout.tiebreakBestLane ? [`Tiebreak: ${version.tiebreak}.`] : []),
  ]
  if (notes.length === 0) return <div className={styles.spacer} />
  return <div className={`${styles.notes} ${styles.cardNotes}`}>{notes.map((n) => <span key={n}>{n}</span>)}</div>
}

/** "Total lb" when the windows multiply a weight by reps. */
function windowsTotal(part: PartOf<'windows'>): string {
  const unit = part.items.find((i) => i.product)?.entry?.find((u) => u !== 'reps')
  return unit ? `Total ${unit}` : 'Total'
}

function ScoreBlock({ card, workout, version }: { card: CardData; workout: CardWorkout; version: ScoreCardVersion | null }) {
  const parts = version?.parts ?? []
  const windows = parts.find((p): p is PartOf<'windows'> => p.kind === 'windows' && p.items.some((i) => i.product))
  const lift = parts.find((p): p is PartOf<'lift'> => p.kind === 'lift')
  const relay = parts.find((p): p is PartOf<'relay'> => p.kind === 'relay')
  const memberCard = card.entrant.team != null
  const tbBox = workout.tiebreakEnabled && !(workout.tiebreakBestLane && memberCard)
  const tb = (
    <>
      <label>{workout.tiebreakScoreType === 'time' ? 'Tiebreak time' : 'Tiebreak'}</label>
      <span className={styles.box} style={{ width: '1in' }} />
    </>
  )
  const label = workout.knockout && version ? `${version.label} time` : SCORE_LABEL[workout.scoreType] ?? 'Score'

  return (
    <div className={styles.score}>
      {windows ? (
        <div className={styles.line}>
          <label>{windowsTotal(windows)}</label>
          {windows.rotation.map((r, i) => (
            <span key={r} className={styles.sum}>{i > 0 && '+ '}{r} <span className={styles.box} style={{ width: '0.6in' }} /></span>
          ))}
          = <span className={`${styles.box} ${styles.strong}`} style={{ width: '0.8in' }} />
        </div>
      ) : workout.scoreType === 'rounds_reps' ? (
        <div className={styles.line}>
          <label>Rounds</label> <span className={styles.box} style={{ width: '0.55in' }} />
          <label>+ Reps</label> <span className={styles.box} style={{ width: '0.65in' }} />
          {tbBox && <><span className={styles.grow} />{tb}</>}
        </div>
      ) : workout.scoreType === 'time' ? (
        <div className={styles.line}>
          <label>{label}</label> <span className={styles.box} style={{ width: '1.25in' }} />
          <span className={styles.or}>or capped — total reps</span> <span className={styles.box} style={{ width: '0.65in' }} />
        </div>
      ) : (
        <div className={styles.line}>
          <label>{label}</label> <span className={styles.box} style={{ width: '1in' }} />
        </div>
      )}
      {relay?.resetTotalEachAthlete && workout.scoreType === 'time' && (
        <div className={styles.line}>
          <span className={styles.or}>Capped: finished athletes’ reps</span> <span className={styles.box} style={{ width: '0.55in' }} />
          + <span className={styles.or}>grey number reached</span> <span className={styles.box} style={{ width: '0.45in' }} />
        </div>
      )}
      {workout.partBEnabled && (
        <div className={styles.line}>
          <label>Part B{lift ? ' total' : ''}</label>
          {lift
            ? <>{Array.from({ length: lift.count }, (_, i) => <span key={i} className={styles.sum}>{i > 0 && '+ '}<span className={styles.box} style={{ width: '0.45in' }} /></span>)} = <span className={styles.box} style={{ width: '0.75in' }} /></>
            : <span className={styles.box} style={{ width: '1in' }} />}
        </div>
      )}
      {tbBox && workout.scoreType !== 'rounds_reps' && (
        <div className={styles.line}>{tb}{parts.some((p) => 'items' in p && p.items.some((i) => i.tiebreakMark)) && <span className={styles.or}>the last TB box filled in</span>}</div>
      )}
      {memberCard && (
        <div className={styles.line}><span className={styles.or}>Enter on this athlete’s lane. CompHQ adds the team’s lanes.</span></div>
      )}
      <div className={styles.sign}>
        <div>Judge #</div>
        <div>{card.entrant.roster ? 'Team captain signature' : 'Athlete signature'}</div>
        <div className={styles.qr}>
          <QRCodeSVG value={card.qr} size={64} marginSize={0} className={styles.qrCode} />
          <span>{card.blank ? 'workout' : 'heat'}</span>
        </div>
      </div>
    </div>
  )
}
