import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { queryKeys } from './queryKeys'

// Who is signed in. The competition lists the same shells gate on live in
// ./competitions, and the mark they draw lives in ./logo, each beside the
// writes that change it.

export interface Me {
  id: string
  email: string | null
  isSuper: boolean
}

export function useMe(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => apiGet<Me>('/api/me'), enabled })
}
