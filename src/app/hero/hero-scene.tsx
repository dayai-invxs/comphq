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

  for (let i = 0; i < count; i++) {
    const frag = document.createElement('span')
    frag.className = 'absolute pointer-events-none'
    parent.appendChild(frag)

    gsap.set(frag, {
      left: cx,
      top: cy,
      width: 2 + Math.random() * 4,
      height: 2 + Math.random() * 3,
      backgroundColor: `rgba(255,245,230,${0.5 + Math.random() * 0.4})`,
    })

    const angle = Math.random() * Math.PI * 2
    const dist = 15 + Math.random() * 40
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist - 10

    gsap.to(frag, {
      x: dx,
      y: dy + 30,
      opacity: 0,
      scale: 0,
      duration: 0.4 + Math.random() * 0.3,
      ease: 'power2.out',
      onComplete: () => frag.remove(),
    })
  }
}

function chiselIn(letter: Element, delay: number) {
  gsap.set(letter, { opacity: 0, scaleY: 0.2, scaleX: 1.2 })

  const tl = gsap.timeline({ delay })

  tl.to(letter, {
    opacity: 1,
    scaleY: 1,
    scaleX: 1,
    duration: 0.2,
    ease: 'power4.out',
    onComplete: () => spawnFragments(letter, 4 + Math.floor(Math.random() * 3)),
  })
    .to(letter, {
      scaleX: 1.08,
      scaleY: 0.92,
      duration: 0.1,
      ease: 'power2.out',
    })
    .to(letter, {
      scaleX: 1,
      scaleY: 1,
      duration: 0.15,
      ease: 'power2.inOut',
    })

  return tl
}

interface Particle {
  el: SVGElement
  layer: 'behind' | 'front'
  kind: 'sand' | 'mote'
}

function createParticles(
  svgBehind: SVGSVGElement,
  svgFront: SVGSVGElement,
): Particle[] {
  const particles: Particle[] = []

  for (let i = 0; i < 22; i++) {
    const layer = i < 17 ? 'behind' : 'front'
    const svg = layer === 'behind' ? svgBehind : svgFront

    const isLarge = i < 6
    const rx = isLarge ? 30 + Math.random() * 50 : 10 + Math.random() * 25
    const ry = rx * (0.3 + Math.random() * 0.4)

    const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
    el.setAttribute('rx', `${rx}`)
    el.setAttribute('ry', `${ry}`)

    const baseOpacity = isLarge ? 0.35 : 0.25
    el.setAttribute(
      'fill',
      layer === 'front'
        ? `rgba(180, 150, 100, ${baseOpacity * 0.5})`
        : `rgba(210, 175, 110, ${baseOpacity})`,
    )
    el.setAttribute('filter', isLarge ? 'url(#dust-blur-heavy)' : 'url(#dust-blur)')

    svg.appendChild(el)
    particles.push({ el, layer, kind: 'sand' })
  }

  for (let i = 0; i < 30; i++) {
    const layer = i < 20 ? 'behind' : 'front'
    const svg = layer === 'behind' ? svgBehind : svgFront

    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    el.setAttribute('r', `${1 + Math.random() * 2.5}`)
    el.setAttribute('fill', 'rgba(255, 230, 180, 0.6)')

    svg.appendChild(el)
    particles.push({ el, layer, kind: 'mote' })
  }

  return particles
}

function animateParticles(particles: Particle[]) {
  const timelines: gsap.core.Timeline[] = []

  particles.forEach((p) => {
    if (p.kind === 'sand') {
      const centerBias = 0.2 + Math.random() * 0.6
      const startX = centerBias * 100
      const driftX = (Math.random() - 0.5) * 30
      const riseHeight = 20 + Math.random() * 40
      const duration = 2.5 + Math.random() * 3
      const delay = Math.random() * 5

      gsap.set(p.el, {
        attr: { cx: `${startX}%`, cy: '100%' },
        opacity: 0,
      })

      const tl = gsap.timeline({ repeat: -1, delay: delay + 2 })

      tl.to(p.el, {
        attr: {
          cy: `${100 - riseHeight * 0.4}%`,
          cx: `${startX + driftX * 0.3}%`,
        },
        opacity: p.layer === 'front' ? 0.2 : 0.5,
        duration: duration * 0.2,
        ease: 'power2.out',
      })
        .to(p.el, {
          attr: {
            cy: `${100 - riseHeight}%`,
            cx: `${startX + driftX}%`,
          },
          opacity: p.layer === 'front' ? 0.12 : 0.3,
          duration: duration * 0.4,
          ease: 'power1.out',
        })
        .to(p.el, {
          attr: {
            cy: `${100 - riseHeight - 5 - Math.random() * 15}%`,
            cx: `${startX + driftX + (Math.random() - 0.5) * 20}%`,
          },
          opacity: 0,
          duration: duration * 0.4,
          ease: 'power1.in',
        })

      timelines.push(tl)
    } else {
      const startX = 15 + Math.random() * 70
      const startY = 10 + Math.random() * 70
      const delay = Math.random() * 8

      gsap.set(p.el, {
        attr: { cx: `${startX}%`, cy: `${startY}%` },
        opacity: 0,
      })

      const tl = gsap.timeline({ repeat: -1, delay: delay + 2.5 })

      const driftDuration = 4 + Math.random() * 6

      tl.to(p.el, {
        attr: {
          cx: `${startX + (Math.random() - 0.5) * 8}%`,
          cy: `${startY - 3 - Math.random() * 5}%`,
        },
        opacity: 0.4 + Math.random() * 0.4,
        duration: driftDuration * 0.3,
        ease: 'power1.inOut',
      })
        .to(p.el, {
          attr: {
            cx: `${startX + (Math.random() - 0.5) * 12}%`,
            cy: `${startY - 6 - Math.random() * 8}%`,
          },
          opacity: 0.2 + Math.random() * 0.3,
          duration: driftDuration * 0.4,
          ease: 'none',
        })
        .to(p.el, {
          opacity: 0,
          duration: driftDuration * 0.3,
          ease: 'power1.in',
        })

      timelines.push(tl)
    }
  })

  return timelines
}

const REQUIRED_IMAGES = 2

export default function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const figureRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const svgBehindRef = useRef<SVGSVGElement>(null)
  const svgFrontRef = useRef<SVGSVGElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const textTopRef = useRef<HTMLDivElement>(null)

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
    const svgBehind = svgBehindRef.current
    const svgFront = svgFrontRef.current
    const flash = flashRef.current
    const scene = sceneRef.current
    const container = containerRef.current
    const textTop = textTopRef.current

    if (!bg || !figure || !glow || !svgBehind || !svgFront || !flash || !scene || !container || !textTop) return

    const letters = textTop.querySelectorAll('[data-letter]')

    gsap.set(bg, { opacity: 1 })
    gsap.set(figure, { opacity: 0 })
    gsap.set(flash, { opacity: 0 })
    gsap.set(scene, { filter: 'brightness(0)' })
    gsap.set([svgBehind, svgFront, glow], { opacity: 0 })
    gsap.set(letters, { opacity: 0, scaleY: 0.2, scaleX: 1.2 })

    const particles = createParticles(svgBehind, svgFront)

    const letterTls: gsap.core.Timeline[] = []
    const entranceTl = gsap.timeline()
    entranceTl
      .to(scene, { filter: 'brightness(1)', duration: 2, ease: 'sine.inOut' }, 0.3)
      .to(glow, { opacity: 0.3, duration: 1.5, ease: 'sine.in' }, 0.5)
      .to(figure, { opacity: 1, duration: 0.4, ease: 'power3.out' }, 2.3)
      .to(glow, { opacity: 0.6, duration: 0.8, ease: 'power1.in' }, 2.5)
      .to([svgBehind, svgFront], { opacity: 1, duration: 0.6, ease: 'power1.in' }, 2.6)
      .call(() => {
        letters.forEach((letter, i) => {
          letterTls.push(chiselIn(letter, i * 0.06))
        })
      }, [], 2.8)

    const glowTl = gsap.timeline({ repeat: -1, delay: 4, yoyo: true })
    glowTl.to(glow, {
      opacity: 0.8,
      scale: 1.05,
      duration: 3,
      ease: 'sine.inOut',
    }).to(glow, {
      opacity: 0.4,
      scale: 0.95,
      duration: 3,
      ease: 'sine.inOut',
    })

    const particleTls = animateParticles(particles)

    function applyParallax(xPct: number, yPct: number) {
      gsap.to(bg, { x: xPct * -20, y: yPct * -12, duration: 1, ease: 'power2.out' })
      gsap.to(figure, { x: xPct * 15, y: yPct * 8, duration: 0.8, ease: 'power2.out' })
      gsap.to(svgBehind, { x: xPct * -10, y: yPct * -7, duration: 1.2, ease: 'power2.out' })
      gsap.to(svgFront, { x: xPct * 8, y: yPct * 5, duration: 0.9, ease: 'power2.out' })
      gsap.to(textTop, { x: xPct * 12, y: yPct * 6, duration: 0.9, ease: 'power2.out' })
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
      letterTls.forEach((tl) => tl.kill())
      particleTls.forEach((tl) => tl.kill())
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [ready])

  const svgDefs = (
    <defs>
      <filter id="dust-blur">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
      </filter>
      <filter id="dust-blur-heavy">
        <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
      </filter>
    </defs>
  )

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

        <svg
          ref={svgBehindRef}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          {svgDefs}
        </svg>

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

        <svg
          ref={svgFrontRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          {svgDefs}
        </svg>

        <div
          ref={textTopRef}
          className={`${cinzel.className} pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5 px-4 text-center sm:gap-1 [text-shadow:0_2px_20px_rgba(0,0,0,0.9),0_0_40px_rgba(0,0,0,0.7)]`}
        >
          <h1
            className="text-[2rem] font-black uppercase tracking-[0.15em] text-[#fff5e6] sm:text-5xl md:text-6xl lg:text-7xl"
          >
            <SplitText>Rugged Rumble</SplitText>
          </h1>
          <h2
            className="text-xl font-bold uppercase tracking-[0.2em] text-[#fff5e6]/90 sm:text-3xl md:text-4xl lg:text-5xl"
          >
            <SplitText>Gladiator Games</SplitText>
          </h2>
          <p
            className="text-base font-normal italic tracking-[0.1em] text-[#fff5e6]/85 sm:text-xl md:text-2xl lg:text-3xl"
          >
            <SplitText>April 25, 2026</SplitText>
          </p>
        </div>
      </div>

      <div
        ref={flashRef}
        className="pointer-events-none absolute inset-0 z-10 bg-white"
      />
    </div>
  )
}
