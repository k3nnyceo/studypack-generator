import { createContext } from 'react'

// The lecture behind the open pack, and a way to show part of it in the
// source viewer: { source, open(refs) }. source is null when this device
// doesn't have the file (e.g. a pack from the Pack library).
export const SourceContext = createContext({ source: null, open: () => {} })
