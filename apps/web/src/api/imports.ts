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
  message?: string
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
  return useCsvImport('/api/import/heats', slug, (qc) => {
    qc.invalidateQueries({ queryKey: queryKeys.schedule(slug) })
    qc.invalidateQueries({ queryKey: queryKeys.ops(slug) })
  })
}

export function useImportJudgeAssignments(slug: string) {
  return useCsvImport('/api/import/judge-assignments', slug, (qc) => {
    qc.invalidateQueries({ queryKey: queryKeys.judgeSchedule(slug) })
  })
}
