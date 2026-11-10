import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { apiPost } from '@/lib/api'
import { queryKeys } from './queryKeys'

// The two CSV imports on the workouts screen. Both answer 200 with a tally
// even when they refused every row, so what landed is read out of the body
// rather than out of the status.

export type ImportResult = {
  imported: number
  workoutsAffected: number[]
  errors: { line: number; message: string }[]
  warnings?: { message: string }[]
  /** What an add / update left in place, per workout. */
  notes?: { message: string }[]
  message?: string
}

/** How a heat import treats workouts that already have heats. */
export type HeatImportMode = 'replace' | 'merge'

/** A workout in the file that already has heats. */
export type ExistingHeats = { number: number; name: string; heats: number; lanes: number; scored: boolean }

/** Asks, writing nothing, which workouts in the file already have heats. */
export function previewHeatImport(slug: string, csv: string) {
  return apiPost<{ existing: ExistingHeats[] }>('/api/import/heats', { slug, csv, mode: 'preview' })
}

function useCsvImport(path: string, slug: string, clear: (qc: QueryClient) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (csv: string) => apiPost<ImportResult>(path, { slug, csv }),
    onSuccess: (result) => {
      if (result.imported > 0) clear(qc)
    },
  })
}

export function useImportHeats(slug: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ csv, mode }: { csv: string; mode: HeatImportMode }) =>
      apiPost<ImportResult>('/api/import/heats', { slug, csv, mode }),
    onSuccess: (result) => {
      if (result.imported === 0) return
      qc.invalidateQueries({ queryKey: queryKeys.schedule(slug) })
      qc.invalidateQueries({ queryKey: queryKeys.ops(slug) })
    },
  })
}

export function useImportJudgeAssignments(slug: string) {
  return useCsvImport('/api/import/judge-assignments', slug, (qc) => {
    qc.invalidateQueries({ queryKey: queryKeys.judgeSchedule(slug) })
  })
}
