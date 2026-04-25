'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Cinzel } from 'next/font/google'
import gsap from 'gsap'
import HeroSkeleton from './hero-skeleton'

const cinzel = Cinzel({ subsets: ['latin'], weight: ['400', '700', '900'] })

function SplitText({ children, className }: { children: string; className?: string }) {
  return (
    <span className={`relative ${className ?? ''}`}>
      {children.split('').map((char, i) => (
        <span
          key={i}
          data-letter
          className={`inline-block ${char === ' ' ? 'w-[0.3em]' : ''}`}
        >
          {char === ' ' ? ' ' : char}
        </span>
      ))}
    </span>
  )
}

function spawnFragments(letter: Element, count: number) {
  const rect = letter.getBoundingClientRect()
  const parent = letter.parentElement
  if (!parent) return

  const parentRect = parent.getBoundingClientRect()
  const cx = rect.left - parentRect.left + rect.width / 2
  const cy = rect.top - parentRect.top + rect.height / 2

  const frags: HTMLSpanElement[] = []
  const xVals: number[] = []
  const yVals: number[] = []

  for (let i = 0; i < count; i++) {
    const frag = document.createElement('span')
    frag.className = 'absolute pointer-events-none'
    parent.appendChild(frag)
    gsap.set(frag, { left: cx, top: cy, width: 2 + Math.random() * 4, height: 2 + Math.random() * 3, backgroundColor: `rgba(255,245,230,${0.5 + Math.random() * 0.4})` })
    frags.push(frag)

    const angle = Math.random() * Math.PI * 2
    const dist = 15 + Math.random() * 40
    xVals.push(Math.cos(angle) * dist)
    yVals.push(Math.sin(angle) * dist + 20)
  }

  gsap.to(frags, {
    x: (i: number) => xVals[i],
    y: (i: number) => yVals[i],
    opacity: 0,
    scale: 0,
    duration: 0.5,
    ease: 'power2.out',
    stagger: 0.02,
    onComplete: () => frags.forEach((f) => f.remove()),
  })
}

function createAndAnimateDust(
  containerBehind: HTMLDivElement,
  containerFront: HTMLDivElement,
): gsap.core.Timeline[] {
  const timelines: gsap.core.Timeline[] = []

  for (let i = 0; i < 14; i++) {
    const layer = i < 10 ? containerBehind : containerFront
    const isLarge = i < 4
    const w = isLarge ? 120 + Math.random() * 160 : 60 + Math.random() * 100
    const h = w * (0.3 + Math.random() * 0.4)

    const el = document.createElement('div')
    el.className = 'absolute rounded-full blur-[12px]'
    layer.appendChild(el)

    const startX = (0.2 + Math.random() * 0.6) * 100
    const driftX = (Math.random() - 0.5) * 30
    const rise = 20 + Math.random() * 40
    const dur = 3 + Math.random() * 3
    const peakOpacity = isLarge ? 0.4 : 0.3

    gsap.set(el, {
      width: w, height: h,
      backgroundColor: 'rgba(210,175,110,0.3)',
      left: `${startX}%`, top: '100%', opacity: 0,
    })

    const riseVh = rise * (window.innerHeight / 100)

    const tl = gsap.timeline({ repeat: -1, delay: Math.random() * 5 + 2 })
    tl.to(el, { y: -riseVh * 0.4, x: driftX * 0.3, opacity: peakOpacity, duration: dur * 0.2, ease: 'power2.out' })
      .to(el, { y: -riseVh, x: driftX, opacity: peakOpacity * 0.5, duration: dur * 0.4, ease: 'power1.out' })
      .to(el, { y: -riseVh - 20, x: driftX + (Math.random() - 0.5) * 20, opacity: 0, duration: dur * 0.4, ease: 'power1.in' })
      .set(el, { x: 0, y: 0 })
    timelines.push(tl)
  }

  for (let i = 0; i < 18; i++) {
    const layer = i < 12 ? containerBehind : containerFront
    const r = 1 + Math.random() * 2.5

    const el = document.createElement('div')
    el.className = 'absolute rounded-full'
    layer.appendChild(el)

    const startX = 15 + Math.random() * 70
    const startY = 10 + Math.random() * 70
    const dur = 4 + Math.random() * 6

    gsap.set(el, {
      width: r * 2, height: r * 2,
      backgroundColor: 'rgba(255,230,180,0.6)',
      left: `${startX}%`, top: `${startY}%`, opacity: 0,
    })

    const tl = gsap.timeline({ repeat: -1, delay: Math.random() * 8 + 2.5 })
    tl.to(el, { x: (Math.random() - 0.5) * 8, y: -(3 + Math.random() * 5), opacity: 0.4 + Math.random() * 0.4, duration: dur * 0.3, ease: 'power1.inOut' })
      .to(el, { x: (Math.random() - 0.5) * 12, y: -(6 + Math.random() * 8), opacity: 0.2 + Math.random() * 0.3, duration: dur * 0.4, ease: 'none' })
      .to(el, { opacity: 0, duration: dur * 0.3, ease: 'power1.in' })
      .set(el, { x: 0, y: 0 })
    timelines.push(tl)
  }

  return timelines
}

const REQUIRED_IMAGES = 2

export default function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const figureRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const dustBehindRef = useRef<HTMLDivElement>(null)
  const dustFrontRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const textTopRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)

  const [imagesLoaded, setImagesLoaded] = useState(0)
  const ready = imagesLoaded >= REQUIRED_IMAGES

  const handleImageLoad = useCallback(() => {
    setImagesLoaded((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (!ready) return

    const bg = bgRef.current
    const figure = figureRef.current
    const glow = glowRef.current
    const dustBehind = dustBehindRef.current
    const dustFront = dustFrontRef.current
    const flash = flashRef.current
    const container = containerRef.current
    const textTop = textTopRef.current
    const dim = dimRef.current

    if (!bg || !figure || !glow || !dustBehind || !dustFront || !flash || !container || !textTop || !dim) return

    const letters = textTop.querySelectorAll('[data-letter]')

    gsap.set(bg, { opacity: 1 })
    gsap.set(figure, { opacity: 0 })
    gsap.set(flash, { opacity: 0 })
    gsap.set(dim, { opacity: 1 })
    gsap.set([dustBehind, dustFront, glow], { opacity: 0 })
    gsap.set(letters, { opacity: 0, scaleY: 0.2, scaleX: 1.2 })

    const dustTls = createAndAnimateDust(dustBehind, dustFront)

    const entranceTl = gsap.timeline()
    entranceTl
      .to(dim, { opacity: 0, duration: 2, ease: 'sine.inOut' }, 0.3)
      .to(glow, { opacity: 0.3, duration: 1.5, ease: 'sine.in' }, 0.5)
      .to(figure, { opacity: 1, duration: 0.4, ease: 'power3.out' }, 2.3)
      .to(glow, { opacity: 0.6, duration: 0.8, ease: 'power1.in' }, 2.5)
      .to([dustBehind, dustFront], { opacity: 1, duration: 0.6, ease: 'power1.in' }, 2.6)
      .to(letters, {
        opacity: 1,
        scaleY: 1,
        scaleX: 1,
        duration: 0.2,
        ease: 'power4.out',
        stagger: {
          each: 0.06,
          onComplete: function (this: gsap.core.Tween) {
            this.targets().forEach((t) => spawnFragments(t as Element, 4 + Math.floor(Math.random() * 3)))
          },
        },
      }, 2.8)

    const glowTl = gsap.timeline({ repeat: -1, delay: 4, yoyo: true })
    glowTl
      .to(glow, { opacity: 0.8, scale: 1.05, duration: 3, ease: 'sine.inOut' })
      .to(glow, { opacity: 0.4, scale: 0.95, duration: 3, ease: 'sine.inOut' })

    const quickX = {
      bg: gsap.quickTo(bg, 'x', { duration: 1, ease: 'power2.out' }),
      bgY: gsap.quickTo(bg, 'y', { duration: 1, ease: 'power2.out' }),
      figure: gsap.quickTo(figure, 'x', { duration: 0.8, ease: 'power2.out' }),
      figureY: gsap.quickTo(figure, 'y', { duration: 0.8, ease: 'power2.out' }),
      dustB: gsap.quickTo(dustBehind, 'x', { duration: 1.2, ease: 'power2.out' }),
      dustBY: gsap.quickTo(dustBehind, 'y', { duration: 1.2, ease: 'power2.out' }),
      dustF: gsap.quickTo(dustFront, 'x', { duration: 0.9, ease: 'power2.out' }),
      dustFY: gsap.quickTo(dustFront, 'y', { duration: 0.9, ease: 'power2.out' }),
      text: gsap.quickTo(textTop, 'x', { duration: 0.9, ease: 'power2.out' }),
      textY: gsap.quickTo(textTop, 'y', { duration: 0.9, ease: 'power2.out' }),
    }

    function applyParallax(xPct: number, yPct: number) {
      quickX.bg(xPct * -20)
      quickX.bgY(yPct * -12)
      quickX.figure(xPct * 15)
      quickX.figureY(yPct * 8)
      quickX.dustB(xPct * -10)
      quickX.dustBY(yPct * -7)
      quickX.dustF(xPct * 8)
      quickX.dustFY(yPct * 5)
      quickX.text(xPct * 12)
      quickX.textY(yPct * 6)
    }

    const handleMouseMove = (e: MouseEvent) => {
      const xPct = (e.clientX / window.innerWidth - 0.5) * 2
      const yPct = (e.clientY / window.innerHeight - 0.5) * 2
      applyParallax(xPct, yPct)
    }

    const handleMouseLeave = () => {
      applyParallax(0, 0)
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      entranceTl.kill()
      glowTl.kill()
      dustTls.forEach((tl) => tl.kill())
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [ready])

  return (
    <div
      ref={containerRef}
      className="relative h-svh w-full overflow-hidden bg-black"
    >
      {!ready && <HeroSkeleton />}

      <div className="absolute inset-0">
        <Image
          src="/hero-background.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover brightness-[0.3] blur-lg scale-110"
          loading="eager"
          onLoad={handleImageLoad}
        />
      </div>

      <div
        ref={sceneRef}
        className="absolute left-1/2 top-0 h-svh -translate-x-1/2 aspect-[1036/1264]"
      >
        <div ref={bgRef} className="absolute -inset-[5%]">
          <Image
            src="/hero-background.jpg"
            alt=""
            fill
            sizes="90svh"
            className="object-cover"
          />
        </div>

        <div
          ref={glowRef}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[25%] blur-[20px] bg-[radial-gradient(ellipse_at_center_bottom,rgba(220,180,100,0.4)_0%,rgba(200,160,80,0.15)_40%,transparent_70%)]"
        />

        <div
          ref={dustBehindRef}
          className="pointer-events-none absolute inset-0"
        />

        <div
          ref={figureRef}
          className="absolute inset-0"
        >
          <Image
            src="/hero-cutout.png"
            alt=""
            fill
            sizes="46vw"
            className="object-contain object-bottom !absolute !bottom-[2%]"
            onLoad={handleImageLoad}
          />
        </div>

        <div
          ref={dustFrontRef}
          className="pointer-events-none absolute inset-0"
        />

        <div
          ref={textTopRef}
          className={`${cinzel.className} pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5 px-4 text-center sm:gap-1 [text-shadow:0_2px_20px_rgba(0,0,0,0.9),0_0_40px_rgba(0,0,0,0.7)]`}
        >
          <h1
            className="text-[clamp(1.875rem,4.5vw,3rem)] font-black uppercase tracking-[0.15em] text-[#fff5e6]"
          >
            <SplitText>Rugged Rumble</SplitText>
          </h1>
          <h2
            className="text-[clamp(1.25rem,3.5vw,2.25rem)] font-bold uppercase tracking-[0.2em] text-[#fff5e6]/90"
          >
            <SplitText>Gladiator Games</SplitText>
          </h2>
          <p
            className="text-[clamp(1rem,2.5vw,1.5rem)] font-normal italic tracking-[0.1em] text-[#fff5e6]/85"
          >
            <SplitText>April 25, 2026</SplitText>
          </p>
        </div>

      </div>

      <div
        ref={dimRef}
        className="pointer-events-none absolute inset-0 bg-black"
      />

      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 z-10 bg-white"
      />
    </div>
  )
}
