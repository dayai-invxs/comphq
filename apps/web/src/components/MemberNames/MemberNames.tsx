import { Text } from '@mond-design-system/react'

// The people on a team, printed small under its name wherever the team is
// shown. An individual has no members and a team may have none listed yet;
// both draw nothing, so the name reads exactly as it did before teams.

export function MemberNames({ members, className }: { members?: string[] | null; className?: string }) {
  if (!members?.length) return null
  return (
    <Text as="span" variant="meta" tone="muted" className={className}>
      {members.join(' · ')}
    </Text>
  )
}
