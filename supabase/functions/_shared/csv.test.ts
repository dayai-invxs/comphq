import { describe, it, expect } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('splits rows and trims cells', () => {
    expect(parseCsv('1, 2 ,3\n4,5,6')).toEqual([['1', '2', '3'], ['4', '5', '6']])
  })

  it('skips blank lines and handles CRLF', () => {
    expect(parseCsv('a,b\r\n\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('keeps a comma inside quotes', () => {
    expect(parseCsv('1,1,1,"Doe, Jane"')).toEqual([['1', '1', '1', 'Doe, Jane']])
  })

  it('unescapes a doubled quote inside quotes', () => {
    expect(parseCsv('"say ""hi"""')).toEqual([['say "hi"']])
  })
})
