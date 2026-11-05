import { Button, Stack, Text } from '@mond-design-system/react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import styles from './WorkoutDescription.module.css'

// A long description pushes the heats, which are what the page is for, off the
// first screen, so it opens at three lines. The toggle only appears when there
// is more to see, which depends on how the text wraps at this width, so it is
// measured rather than worked out from the text's length.

export function WorkoutDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const textId = useId()

  useLayoutEffect(() => {
    // Open, the text fills its box and nothing reads as overflowing, which
    // would take away the button that closes it. Measure again on closing.
    if (expanded) return
    const wrapper = box.current
    const shown = wrapper?.firstElementChild
    if (!wrapper || !shown) return

    const measure = () => setOverflows(shown.scrollHeight > shown.clientHeight)
    measure()

    // Turning a phone or resizing a window rewraps the text.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [text, expanded])

  return (
    <Stack gap="hairline" align="start">
      <div ref={box} className={styles.box}>
        <Text id={textId} className={`${styles.text} ${expanded ? '' : styles.clamped}`}>{text}</Text>
      </div>
      {overflows && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'See less' : 'See more'}
        </Button>
      )}
    </Stack>
  )
}
