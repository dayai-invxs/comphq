'use client'

import dynamic from 'next/dynamic'
import HeroSkeleton from './hero-skeleton'

const HeroScene = dynamic(() => import('./hero-scene'), {
  ssr: false,
  loading: () => <HeroSkeleton />,
})

export default function HeroPage() {
  return <HeroScene />
}
