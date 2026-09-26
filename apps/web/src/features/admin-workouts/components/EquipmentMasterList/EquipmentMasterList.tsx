import { Button, DataTable, EmptyState, Inline, Stack, Text } from '@mond-design-system/react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import type { EquipmentSummaryItem } from '@/api/equipmentSummary'
import styles from './EquipmentMasterList.module.css'

// What the competition has to own. The count is the most needed at once, never
// the sum, and a breakdown row with no division applies to every division —
// both are the route's rules, locked in v1's own equipment-summary spec.
//
// The breakdown count reads `×5` rather than v1's bare `5`, because the same
// number appears twice in a row otherwise: the item's total is by definition
// one of its breakdown counts.

interface Props {
  items?: EquipmentSummaryItem[]
  loading: boolean
  onLoad: () => void
}

const scope = (names: (string | null)[]) =>
  names.every((d) => d === null) ? 'All divisions' : names.filter(Boolean).join(', ')

export function EquipmentMasterList({ items, loading, onLoad }: Props) {
  return (
    <DataPanel
      title="Equipment Master List"
      description="What the competition has to own, counted at the busiest heat rather than summed."
      flush={items != null}
      actions={
        <Button variant="secondary" size="sm" onClick={onLoad} loading={loading} disabled={loading}>
          {loading ? 'Loading…' : items ? 'Refresh' : 'Load'}
        </Button>
      }
    >
      {items ? (
        <DataTable
          label="Equipment needed across every workout"
          rows={items}
          rowKey={(e) => e.item}
          empty="No equipment listed on any workout."
          columns={[
            {
              key: 'item',
              header: 'Item',
              cell: (e) => (
                <Stack gap="hairline">
                  <Text variant="label">{e.item}</Text>
                  <Inline gap="base" align="baseline" className={styles.breakdown}>
                    {[...e.breakdown]
                      .sort((a, b) => a.workoutNumber - b.workoutNumber)
                      .map((bd) => (
                        <Text key={bd.workoutId} variant="meta" tone="muted">
                          <span className={styles.wod}>WOD {bd.workoutNumber}</span>
                          {' · '}
                          <span>{scope(bd.divisionNames)}</span>
                          {' · '}
                          <span className={styles.count}>×{bd.maxCount}</span>
                        </Text>
                      ))}
                  </Inline>
                </Stack>
              ),
            },
            {
              key: 'max',
              header: 'Max needed',
              width: '8rem',
              cell: (e) => <Text variant="label" tone="accent">{e.maxCount}</Text>,
            },
          ]}
        />
      ) : (
        <EmptyState
          title="Not counted yet"
          description="Reading it walks every workout, so it is asked for rather than read on the way in."
        />
      )}
    </DataPanel>
  )
}
