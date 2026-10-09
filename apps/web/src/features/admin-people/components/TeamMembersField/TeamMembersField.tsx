import { Button, Field, Inline, Input, Select, Stack, Text } from '@mond-design-system/react'
import type { Gender } from '@/api/athletes'
import styles from './TeamMembersField.module.css'

// The people on a team, in the order they are listed. A team is what competes;
// these are names under it. The list may be left empty — a team that has not
// named anyone yet still takes a lane and gets scored.

export type MemberDraft = { name: string; gender: Gender | '' }

interface Props {
  members: MemberDraft[]
  onChange: (next: MemberDraft[]) => void
  /** Athletes per team in this division, to show the count against. */
  teamSize: number
}

export function TeamMembersField({ members, onChange, teamSize }: Props) {
  const set = (i: number, patch: Partial<MemberDraft>) =>
    onChange(members.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= members.length) return
    const next = members.slice()
    next.splice(to, 0, ...next.splice(from, 1))
    onChange(next)
  }

  return (
    <Field label="Team members" hint={`${members.length} of ${teamSize} listed. Optional.`}>
      <Stack gap="hairline">
        {members.map((m, i) => (
          <Inline key={i} gap="hairline" align="center" className={styles.row}>
            <Input
              className={styles.name}
              aria-label={`Member ${i + 1} name`}
              placeholder={`Member ${i + 1}`}
              value={m.name}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <Select
              aria-label={`Member ${i + 1} gender`}
              value={m.gender}
              onChange={(e) => set(i, { gender: e.target.value as MemberDraft['gender'] })}
            >
              <option value="">Gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </Select>
            <Button size="sm" variant="ghost" aria-label={`Move member ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</Button>
            <Button size="sm" variant="ghost" aria-label={`Move member ${i + 1} down`} disabled={i === members.length - 1} onClick={() => move(i, i + 1)}>↓</Button>
            <Button size="sm" variant="ghost" aria-label={`Remove member ${i + 1}`} onClick={() => onChange(members.filter((_, j) => j !== i))}>Remove</Button>
          </Inline>
        ))}
        {members.length === 0 && (
          <Text variant="meta" tone="muted">Nobody listed yet. The team still competes.</Text>
        )}
        <Inline>
          <Button size="sm" variant="secondary" onClick={() => onChange([...members, { name: '', gender: '' }])}>
            Add member
          </Button>
        </Inline>
      </Stack>
    </Field>
  )
}

/** The drafts as the API takes them: blank rows dropped, names trimmed. */
export function membersBody(members: MemberDraft[]) {
  return members
    .map((m) => ({ name: m.name.trim(), gender: m.gender || null }))
    .filter((m) => m.name)
}
