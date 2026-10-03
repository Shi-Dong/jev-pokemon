import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionRoutes, storyBlockedEdges, recoveryChoice } from '../../src/agent/navigation.js';
import { MILESTONES, restoreVisited } from '../../src/knowledge/milestones.js';
import type { Grid } from '../../src/game/world.js';
import { RegionGraph } from '../../src/game/regions.js';
import type { MapData, Rom } from '../../src/game/rom.js';
import type { GameState } from '../../src/game/state.js';

test('connections preserve distinct landing regions and respect blocked paths', () => {
  const g = { w: 4, h: 3, walkable: (x: number, y: number) => x >= 0 && x < 4 && y >= 0 && y < 3,
    tile: () => 0, grass: () => false, wild: () => false, water: () => false, cuttable: () => false,
    counter: () => false, ledge: () => false, pairBlocked: () => false } as unknown as Grid;
  const md = {} as MapData;
  const c = {dir: 'south', map: 16, xAlign: 0, yAlign: 0} as const;
  const rg = {connectionTarget: (_m: MapData, _c: unknown, x: number) => x < 2 ? '16:0' : '16:1', landsOnWater: () => false} as unknown as unknown as RegionGraph;
  const routes = connectionRoutes(g, md, c, rg, 3, 1, new Set(), false);
  assert.deepEqual(routes.map(r => r.region), ['16:0', '16:1']);
  assert.ok(routes[0].path.length > routes[1].path.length);
  assert.ok(routes.every(r => r.path.at(-1)!.y === 3));
  assert.deepEqual(connectionRoutes(g, md, c, rg, 3, 1, new Set(['0,2','1,2']), false).map(r => r.region), ['16:1']);
  const water = {...rg, landsOnWater: () => true} as unknown as RegionGraph;
  assert.equal(connectionRoutes(g, md, c, water, 3, 1, new Set(), false).length, 0);
});

test('Saffron route graph excludes locked entry, permits exit, and opens with flag or drink', () => {
  const rom = {maps: new Map([[10, {name: 'SAFFRON_CITY'}], [17, {name: 'ROUTE_6'}]])} as unknown as Rom;
  const rg = {edges: () => [['17:0','10:0'],['10:0','17:0'],['10:0','10:1']]} as unknown as RegionGraph;
  let flag = 0; let bag: {name: string}[] = [];
  const gs = {u8: () => flag, bag: () => bag} as unknown as GameState;
  assert.deepEqual([...storyBlockedEdges(rom, rg, gs)], ['17:0>10:0']);
  bag = [{name: 'FRESH WATER'}]; assert.equal(storyBlockedEdges(rom, rg, gs).size, 0);
  bag = []; flag = 0x40; assert.equal(storyBlockedEdges(rom, rg, gs).size, 0);
});

test('three badge bits do not skip Lavender and Celadon travel milestones', () => {
  restoreVisited([]);
  const gs = {badges: 0b111, event: () => false} as unknown as GameState;
  for (const id of ['rock_tunnel','celadon','fuchsia']) assert.equal(MILESTONES.find(m => m.id === id)!.done(gs), false);
  assert.equal(MILESTONES.find(m => m.id === 'rock_tunnel')!.done({...gs, badges: 0b1111} as GameState), true);
});

test('loop recovery prefers useful less-repeated routes over high-probability signs', () => {
  const options = [{key: 'sign', desc: 'Already read'}, {key: 'cut', desc: 'Leads toward the objective by opening a route'}, {key: 'east', desc: 'Leads toward the objective'}];
  const p = {sign: .9, cut: .08, east: .02};
  assert.equal(recoveryChoice(options, p, k => k === 'cut' ? 3 : 0), 'east');
  assert.equal(recoveryChoice(options, p, () => 0), 'cut');
  assert.equal(recoveryChoice(options.slice(0, 1), p, () => 0), undefined);
});

test('refining another map retains remembered stationary blockers', () => {
  const rom = {maps: new Map<number, MapData>(), spinners: new Map()} as unknown as Rom;
  const rg = new RegionGraph(rom);
  for (const id of [1, 2]) {
    rom.maps.set(id, {id, name: 'BLOCKER_TEST_' + id, warps: [], objects: [], connections: []} as unknown as MapData);
    (rg as unknown as {grids: Map<number, unknown>}).grids.set(id, {w: 5, h: 1, walk: () => true, tile: () => 0, ledge: () => false, pairBlocked: () => false});
  }
  const blocker = new Set(['2,0']);
  rg.refine(1, blocker);
  assert.notEqual(rg.regionAt(1, 0, 0), rg.regionAt(1, 4, 0));
  rg.refine(2, new Set(), undefined, '', new Map([[1, {key: 'observed', blocked: blocker}]]));
  assert.notEqual(rg.regionAt(1, 0, 0), rg.regionAt(1, 4, 0));
  // A new observation that the obstruction is gone reopens the component.
  rg.refine(1, new Set());
  assert.equal(rg.regionAt(1, 0, 0), rg.regionAt(1, 4, 0));
});
