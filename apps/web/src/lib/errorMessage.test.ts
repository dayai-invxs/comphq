import { describe, expect, it } from 'vitest'
import { HttpError } from './http'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it('digs the sentence out of the routers JSON body', () => {
    expect(errorMessage(new HttpError(403, '{"error":"Not yours"}'))).toBe('Not yours')
  })

  it('appends the detail a 500 carries', () => {
    expect(errorMessage(new HttpError(500, '{"error":"Internal Server Error","detail":"connection refused"}')))
      .toBe('Internal Server Error: connection refused')
  })

  it('shows a non-JSON body as it came', () => {
    expect(errorMessage(new HttpError(502, 'Bad Gateway'))).toBe('Bad Gateway')
  })

  it('falls back to the status when the body is empty', () => {
    expect(errorMessage(new HttpError(504, ''))).toBe('HTTP 504')
  })

  it('reads a plain Error', () => {
    expect(errorMessage(new Error('offline'))).toBe('offline')
  })

  it('stringifies anything else', () => {
    expect(errorMessage('string throw')).toBe('string throw')
  })
})
