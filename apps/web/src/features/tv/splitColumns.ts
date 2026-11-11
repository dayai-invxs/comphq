// Shared by both halves of the TV board: a heat's lanes and a long division's
// standings are split into side-by-side lists the same way.

/** `items` in reading order, split into `columns` runs as even as they go:
    18 into 2 is 9 and 9, 17 into 2 is 9 and 8. Never more runs than items. */
export function splitColumns<T>(items: readonly T[], columns: number): T[][] {
  const count = Math.max(1, Math.min(columns, items.length))
  const size = Math.ceil(items.length / count)
  const runs: T[][] = []
  for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size))
  return runs.length ? runs : [[]]
}
