import { Button, Inline, Text } from '@mond-design-system/react'

// Scores save themselves as the cursor leaves a row, so there is no Save
// button. This line is how whoever is scoring knows it worked, and the one
// way to send again a row whose save failed (bad gym Wi-Fi).

export type SaveStatusValue =
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'failed'; count: number; retry: () => void }

export function SaveStatus({ status }: { status: SaveStatusValue | null }) {
  // Always in the page, so a screen reader hears it change.
  return (
    <div role="status">
      {status?.state === 'saving' && <Text as="span" variant="meta" tone="muted">Saving…</Text>}
      {status?.state === 'saved' && <Text as="span" variant="meta" tone="muted">All scores saved</Text>}
      {status?.state === 'failed' && (
        <Inline gap="tight" align="center" wrap>
          <Text as="span" variant="meta" tone="danger">
            {status.count === 1 ? '1 score not saved' : `${status.count} scores not saved`}
          </Text>
          <Button variant="secondary" size="sm" onClick={status.retry}>Retry</Button>
        </Inline>
      )}
    </div>
  )
}
