import { Button, FileDrop, Inline, Stack } from '@mond-design-system/react'
import { DataPanel } from '@/components/DataPanel/DataPanel'
import styles from './LogoSection.module.css'

// v1: the Competition Logo section of src/app/[slug]/admin/setup/page.tsx.
//
// v1 hid a file input behind a dashed box and clicked it from a ref; the same
// act is FileDrop, which also takes a file dropped on it — an affordance v1
// did not have.
//
// Defect 24: v1 offered image/svg+xml in the picker, which POST /api/logo
// refuses on purpose — an SVG is a script-execution vector and the route's
// MIME table leaves it out. v1 then acted only `if (res.ok)`, so choosing one
// appeared to do nothing at all. The picker now offers what the route takes.
//
// Defect 26 — the replaced logo kept being drawn from the browser's cache — is
// fixed in useUploadLogo, which is where the one URL every drawing of the mark
// reads is written. There is nothing local to stamp here.

interface Props {
  url: string | null
  busy?: boolean
  onUpload: (file: File) => Promise<unknown>
  onRemove: () => Promise<unknown>
}

export function LogoSection({ url, busy, onUpload, onRemove }: Props) {
  // Reported by the page banner; caught so a refused write does not surface as
  // an unhandled rejection from an event handler.
  const attempt = (write: Promise<unknown>) => { void write.catch(() => {}) }

  return (
    <DataPanel
      title="Competition Logo"
      description="Drawn in the bar at the top of every screen, in place of the CompHQ mark."
    >
      <Stack gap="base">
        {url && (
          <Inline gap="base" justify="between" align="center" wrap>
            <img
              src={url}
              alt="Competition logo"
              width={160}
              height={80}
              className={styles.logo}
            />
            <Button variant="danger" disabled={busy} onClick={() => attempt(onRemove())}>
              Remove
            </Button>
          </Inline>
        )}
        <FileDrop
          label={busy ? 'Uploading...' : url ? 'Replace' : 'Click to upload logo'}
          hint="PNG, JPG, GIF or WebP"
          accept="image/png,image/jpeg,image/gif,image/webp"
          disabled={busy}
          onFiles={(files) => attempt(onUpload(files[0]))}
        />
      </Stack>
    </DataPanel>
  )
}
