import { describe, it, expect } from 'vitest'
import { drizzleMock as mock } from '@/test/setup'
import { hasJudgeToken, judgeToken, JUDGE_TOKEN_HEADER } from './judgeToken'

const req = (token?: string) =>
  new Request('http://test/api/checks', { headers: token ? { [JUDGE_TOKEN_HEADER]: token } : {} })

describe('judge tokens', () => {
  it('is the same for the same competition and password', async () => {
    expect(await judgeToken(1, 'letmein')).toBe(await judgeToken(1, 'letmein'))
  })

  // A token for one competition opens no other.
  it('differs between competitions', async () => {
    expect(await judgeToken(1, 'letmein')).not.toBe(await judgeToken(2, 'letmein'))
  })

  it('accepts a token for the competition\'s current password', async () => {
    mock.queueResult([{ value: 'letmein' }])
    expect(await hasJudgeToken(req(await judgeToken(1, 'letmein')), 1)).toBe(true)
  })

  // Changing the password on Setup retires every token handed out before.
  it('refuses a token from before the password changed', async () => {
    mock.queueResult([{ value: 'newpass' }])
    expect(await hasJudgeToken(req(await judgeToken(1, 'letmein')), 1)).toBe(false)
  })

  it('refuses a request with no token, or a made-up one', async () => {
    expect(await hasJudgeToken(req(), 1)).toBe(false)
    mock.queueResult([{ value: 'letmein' }])
    expect(await hasJudgeToken(req('x'.repeat(43)), 1)).toBe(false)
  })

  it('uses the default password for a competition that never set one', async () => {
    mock.queueResult([])
    expect(await hasJudgeToken(req(await judgeToken(1, "I'majudge")), 1)).toBe(true)
  })
})
