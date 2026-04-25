export default function HeroSkeleton() {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-gray-300" />
    </div>
  )
}
