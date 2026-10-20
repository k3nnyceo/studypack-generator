// The ready-made packs in the Pack library: written and checked by
// StudyPack, shipped with the app (server/shared.js lists them as verified,
// next to the packs admins and students share). To add one, put its study
// guide JSON here and list it below. The *-full packs are fuller versions of
// the first-year course packs, built from course outlines (one module per topic).
import { createRequire } from 'node:module'

// require() of JSON is what Vercel's bundler reliably follows and includes.
const require = createRequire(import.meta.url)

export const READY_MADE_PACKS = [
  require('./chm101-general-chemistry-i-full.json'),
  require('./chm101-general-chemistry-i.json'),
  require('./chm102-general-chemistry-ii-full.json'),
  require('./chm102-general-chemistry-ii.json'),
  require('./chm107-general-practical-chemistry-i-full.json'),
  require('./chm107-general-practical-chemistry-i.json'),
  require('./chm108-general-practical-chemistry-ii-full.json'),
  require('./chm108-general-practical-chemistry-ii.json'),
  require('./eee-207-chapter-1.json'),
  require('./get101-engineer-in-society-full.json'),
  require('./get101-engineer-in-society.json'),
  require('./get102-engineering-graphics-and-solid-modelling-i-full.json'),
  require('./get102-engineering-graphics-and-solid-modelling-i.json'),
  require('./gst102-use-of-english-ii-full.json'),
  require('./gst102-use-of-english-ii.json'),
  require('./gst111-communication-in-english-full.json'),
  require('./gst111-communication-in-english.json'),
  require('./mce101-introduction-to-mechatronics-engineering-full.json'),
  require('./mce101-introduction-to-mechatronics-engineering.json'),
  require('./mth101-elementary-mathematics-i-full.json'),
  require('./mth101-elementary-mathematics-i.json'),
  require('./mth102-elementary-mathematics-ii-calculus-full.json'),
  require('./mth102-elementary-mathematics-ii-calculus.json'),
  require('./mth103-elementary-mathematics-iii-full.json'),
  require('./mth103-elementary-mathematics-iii.json'),
  require('./phy101-general-physics-i-mechanics-full.json'),
  require('./phy101-general-physics-i-mechanics.json'),
  require('./phy102-general-physics-ii-electricity-magnetism-full.json'),
  require('./phy102-general-physics-ii-electricity-magnetism.json'),
  require('./phy103-general-physics-iii-behaviour-of-matter-full.json'),
  require('./phy103-general-physics-iii-behaviour-of-matter.json'),
  require('./phy104-general-physics-iv-vibrations-waves-optics-full.json'),
  require('./phy104-general-physics-iv-vibrations-waves-optics.json'),
  require('./phy107-general-practical-physics-i-full.json'),
  require('./phy107-general-practical-physics-i.json'),
  require('./phy108-general-practical-physics-ii-full.json'),
  require('./phy108-general-practical-physics-ii.json'),
  require('./strength-of-materials.json'),
]
