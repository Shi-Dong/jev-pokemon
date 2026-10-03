import type { MapData, Rom } from '../game/rom.js';
import type { RegionGraph } from '../game/regions.js';
import type { GameState } from '../game/state.js';
import { findPath, type Grid, type Step } from '../game/world.js';

/** One executable crossing per distinct landing area, rather than one per neighboring map. */
export function connectionRoutes(g: Grid, md: MapData, c: MapData['connections'][number], rg: RegionGraph, px: number, py: number, blocked: Set<string>, surf: boolean): { region: string; path: Step[]; inside: { x: number; y: number } }[] {
  const outside = (x: number, y: number) => c.dir === 'north' ? y === -1 : c.dir === 'south' ? y === g.h : c.dir === 'west' ? x === -1 : x === g.w;
  const landing = (x: number, y: number) => {
    if (!outside(x, y)) return null;
    const ix = Math.min(Math.max(x, 0), g.w - 1), iy = Math.min(Math.max(y, 0), g.h - 1);
    if (!g.water(ix, iy) && rg.landsOnWater(md, c, ix, iy)) return null;
    return rg.connectionTarget(md, c, ix, iy);
  };
  const areas = new Set<string>();
  const length = c.dir === 'north' || c.dir === 'south' ? g.w : g.h;
  for (let i = 0; i < length; i++) {
    const x = c.dir === 'west' ? -1 : c.dir === 'east' ? g.w : i;
    const y = c.dir === 'north' ? -1 : c.dir === 'south' ? g.h : i;
    const r = landing(x, y);
    if (r) areas.add(r);
  }
  const routes: ReturnType<typeof connectionRoutes> = [];
  for (const region of areas) {
    const goal = (x: number, y: number) => landing(x, y) === region;
    const path = findPath(g, px, py, goal, { blocked, allowExit: goal, grassCost: 1, surf });
    if (!path?.length) continue;
    const inside = path.length > 1 ? path[path.length - 2] : { x: px, y: py };
    routes.push({ region, path, inside });
  }
  return routes;
}

/** Closed Saffron guards are story barriers, even when the ROM collision graph connects the roads. */
export function storyBlockedEdges(rom: Rom, rg: RegionGraph, gs: GameState): Set<string> {
  const open = !!(gs.u8('wStatusFlags1') & 0x40) || gs.bag().some(i => /^(FRESH WATER|SODA POP|LEMONADE)$/.test(i.name));
  if (open) return new Set();
  return new Set(rg.edges().filter(([a, b]) => {
    const from = Number(a.split(':')[0]), to = Number(b.split(':')[0]);
    return from !== to && rom.maps.get(to)?.name === 'SAFFRON_CITY';
  }).map(([a, b]) => a + '>' + b));
}

/** Recovery keeps the model's ranking within useful actions, rather than wandering among all alternatives. */
export function recoveryChoice(options: { key: string; desc: string }[], probabilities: Record<string, number>, attempts: (key: string) => number): string | undefined {
  const useful = options.filter(c => /Leads toward the objective|objective is in this place/.test(c.desc));
  if (!useful.length) return undefined;
  return useful.sort((a, b) => attempts(a.key) - attempts(b.key) || (probabilities[b.key] ?? 0) - (probabilities[a.key] ?? 0))[0].key;
}
