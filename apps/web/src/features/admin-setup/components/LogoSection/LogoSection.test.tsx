import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { LogoSection } from './LogoSection'

// v1: the Competition Logo section of src/app/[slug]/admin/setup/page.tsx.
// One logo for the whole install, not one per competition — the row it is
// stored in carries competitionId 0 (defect 8, ported as-is).

const onUpload = vi.fn()
const onRemove = vi.fn()

const URL_ = 'https://cdn.example/logos/logo.png'

function draw(over: Partial<Parameters<typeof LogoSection>[0]> = {}) {
  return render(<LogoSection url={null} onUpload={onUpload} onRemove={onRemove} {...over} />)
}

// FileDrop's own input is aria-hidden — the button in front of it is what a
// person uses — so a test reaches it the way the picker does, by element.
const picker = () => document.querySelector('input[type="file"]') as HTMLInputElement

const png = () => new File(['x'], 'logo.png', { type: 'image/png' })

beforeEach(() => {
  vi.clearAllMocks()
  onUpload.mockResolvedValue(undefined)
  onRemove.mockResolvedValue(undefined)
})

it('invites a file when there is no logo, and says which kinds', () => {
  draw()
  expect(screen.getByText('Click to upload logo')).toBeInTheDocument()
  expect(screen.getByText('PNG, JPG, GIF or WebP')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
})

it('says where the logo ends up, so it is clear what is being replaced', () => {
  draw()
  expect(
    screen.getByText('Drawn in the bar at the top of every screen, in place of the CompHQ mark.'),
  ).toBeInTheDocument()
})

it('shows the logo it has, and offers to replace or remove it', () => {
  draw({ url: URL_ })
  expect(screen.getByRole('img', { name: 'Competition logo' })).toHaveAttribute('src', URL_)
  expect(screen.getByText('Replace')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
})

it('uploads the file it is handed', async () => {
  draw()
  const file = png()
  fireEvent.change(picker(), { target: { files: [file] } })
  await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file))
})

// Defect 24: v1's picker offered SVG and POST /api/logo refuses it — MIME_TO_EXT
// leaves image/svg+xml out, calling it a script-execution vector. v1 acted only
// `if (res.ok)`, so choosing one appeared to do nothing at all.
it('offers only the kinds the server will take', () => {
  draw()
  expect(picker()).toHaveAttribute('accept', 'image/png,image/jpeg,image/gif,image/webp')
  expect(picker().getAttribute('accept')).not.toContain('svg')
})

// Defect 26: the stored object keeps its name across a replacement, so the URL
// does not change and the browser goes on drawing the old picture. The stamp
// that gets past that is put on the one URL every drawing of the mark reads,
// which is useUploadLogo's; this section draws what it is handed.
it('draws the URL it is given, without stamping one of its own', () => {
  draw({ url: `${URL_}?t=17` })
  expect(screen.getByRole('img', { name: 'Competition logo' })).toHaveAttribute('src', `${URL_}?t=17`)
})

// v1 asked nothing before deleting the logo, and neither does this.
it('removes the logo on the word of one click', async () => {
  draw({ url: URL_ })
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(onRemove).toHaveBeenCalled())
})

it('says what it is doing while the file is going up', () => {
  draw({ busy: true })
  expect(screen.getByText('Uploading...')).toBeInTheDocument()
})
