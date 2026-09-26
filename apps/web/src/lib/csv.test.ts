import { describe, expect, it } from 'vitest'
import { parseCsv, parseNameList, withoutKnown } from './csv'

describe('parseCsv', () => {
  it('splits rows and trims cells', () => {
    expect(parseCsv('1, 2 ,3\n4,5,6')).toEqual([['1', '2', '3'], ['4', '5', '6']])
  })

  it('skips blank lines and handles CRLF', () => {
    expect(parseCsv('a,b\r\n\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('keeps a comma inside quotes', () => {
    expect(parseCsv('1,"Doe, Jane"')).toEqual([['1', 'Doe, Jane']])
  })

  it('unescapes a doubled quote inside quotes', () => {
    expect(parseCsv('"say ""hi"""')).toEqual([['say "hi"']])
  })
})

describe('parseNameList', () => {
  it('takes one name per line', () => {
    expect(parseNameList('RX\nScaled\n\nMasters', 'Division')).toEqual(['RX', 'Scaled', 'Masters'])
  })

  it('takes the first column of a CSV', () => {
    expect(parseNameList('RX,1\n"Masters, 40+",2', 'Division')).toEqual(['RX', 'Masters, 40+'])
  })

  it('drops a header row naming the column', () => {
    expect(parseNameList('division\nRX', 'Division')).toEqual(['RX'])
  })

  it('drops repeats, whatever their case', () => {
    expect(parseNameList('RX\nrx\nScaled', 'Division')).toEqual(['RX', 'Scaled'])
  })
})

describe('withoutKnown', () => {
  it('drops names already known, ignoring case', () => {
    expect(withoutKnown(['Teens', 'rx', 'Masters'], ['RX', 'Scaled'])).toEqual(['Teens', 'Masters'])
  })
})
