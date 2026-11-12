import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { testWorkout } from '../../testWorkout'
import coliseum from '../../__fixtures__/gladiator-4-coliseum.json'
import { readScoreCardText, ScoreCardEditor } from './ScoreCardEditor'

describe('readScoreCardText', () => {
  it('reads empty, broken JSON, failed checks and a structure apart', () => {
    expect(readScoreCardText('  ')).toEqual({ empty: true })
    expect(readScoreCardText('{')).toMatchObject({ empty: false, json: false })
    expect(readScoreCardText('{"version":1}')).toMatchObject({ json: true, ok: false })
    expect(readScoreCardText(JSON.stringify(coliseum))).toMatchObject({ json: true, ok: true })
  })
})

describe('ScoreCardEditor', () => {
  const w = testWorkout([{ heat: 1, lane: 1, athleteId: 1, name: 'Mario', gender: 'male' }])
  const renderEditor = (onSave = vi.fn().mockResolvedValue(true)) => {
    render(
      <MemoryRouter>
        <ScoreCardEditor workout={w} slug="rugged" competitionName="Rugged" showBib={false} loading={false} onSave={onSave} onClose={() => {}} />
      </MemoryRouter>,
    )
    return onSave
  }
  const paste = (text: string) => fireEvent.change(screen.getByLabelText('Structure (JSON)'), { target: { value: text } })

  it('previews the first lane and saves a structure that passes', async () => {
    const onSave = renderEditor()
    expect(screen.getByText('Mario')).toBeTruthy()
    paste(JSON.stringify(coliseum))
    expect(screen.getByText(/Can’t print yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ scoreCard: expect.objectContaining({ version: 1 }) })
  })

  it('answers a rep question into the structure', () => {
    const onSave = renderEditor()
    paste(JSON.stringify(coliseum))
    fireEvent.change(screen.getByLabelText(/how many reps is each finished run worth/), { target: { value: '1' } })
    expect(screen.queryByText(/Can’t print yet/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0][0].scoreCard.repDefinitions[0]).toMatchObject({ value: 1, source: 'organizer' })
  })

  it('won’t save what fails its checks, and says why', () => {
    renderEditor()
    paste('{"version":1,"versions":[]}')
    expect(screen.getByRole('alert').textContent).toMatch(/versions/)
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
