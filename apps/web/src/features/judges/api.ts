import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiGet } from '@/lib/api'
import type { JudgeScheduleData } from './violations'

// GET /api/judge-schedule is public in v1 (defect 13) — plausibly deliberate
// for a board hung by the floor, but nothing gates it. Read as v1 read it.
//
// It does not poll: v1 fetched it once per mount. Assignments are made before
// a competition runs, not during it.
export function useJudgeSchedule(slug: string) {
  return useQuery({
    queryKey: queryKeys.judgeSchedule(slug),
    queryFn: () => apiGet<JudgeScheduleData>(`/api/judge-schedule?slug=${slug}`),
    enabled: !!slug,
  })
}
