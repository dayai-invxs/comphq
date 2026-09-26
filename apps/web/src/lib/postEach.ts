/** Sends each item in turn and keeps going past a refusal, so an import that
    trips on row 4 still lands rows 5 and 6. Throws once at the end, naming
    every refusal. Resolves to how many landed. */
export async function postEach<T>(
  items: T[],
  label: (item: T) => string,
  send: (item: T) => Promise<unknown>,
): Promise<number> {
  if (items.length === 0) throw new Error('Nothing new to import')
  const refused: string[] = []
  for (const item of items) {
    try {
      await send(item)
    } catch (e) {
      refused.push(`"${label(item)}" (${e instanceof Error ? e.message : String(e)})`)
    }
  }
  if (refused.length) throw new Error(`Could not add ${refused.join(', ')}`)
  return items.length
}
