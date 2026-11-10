// A secret workout stays off every public screen until it goes active; once
// revealed it stays on through completed. Until then the screens show only
// that a workout with its number exists: "Workout N: TBA".

export function isUnannounced(w: { secret: boolean; status: string }): boolean {
  return w.secret && w.status !== 'active' && w.status !== 'completed'
}

export const TBA = 'TBA'
