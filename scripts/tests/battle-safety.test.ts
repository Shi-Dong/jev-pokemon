import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { GameState } from '../../src/game/state.js';
import { sym } from '../../src/game/symbols.js';
import type { Emulator } from '../../src/emu/emulator.js';
import type { Rom } from '../../src/game/rom.js';
import { Jev } from '../../src/jev/client.js';

test('Disable decodes the move slot and expires; stale overworld bytes are ignored', () => {
  const mem = new Uint8Array(65536);
  const rom = { moves: new Map([[10, {name: 'SCRATCH'}], [45, {name: 'GROWL'}]]) } as unknown as Rom;
  const gs = new GameState({mem} as unknown as Emulator, rom);
  mem[sym('wIsInBattle')] = 2;
  mem[sym('wBattleMon') + 8] = 10;
  mem[sym('wBattleMon') + 9] = 45;
  mem[sym('wPlayerDisabledMove')] = 0x13;
  assert.deepEqual(gs.disabledMove, {name: 'SCRATCH', turns: 3});
  mem[sym('wPlayerDisabledMove')] = 0x25;
  assert.deepEqual(gs.disabledMove, {name: 'GROWL', turns: 5});
  for (const packed of [0, 0x10, 0x03, 0x53]) {
    mem[sym('wPlayerDisabledMove')] = packed;
    assert.equal(gs.disabledMove, null);
  }
  mem[sym('wPlayerDisabledMove')] = 0x13;
  mem[sym('wIsInBattle')] = 0;
  assert.equal(gs.disabledMove, null);
});

test('repeated battles and menus call the backend; overworld cache is purpose-scoped', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-battle-safety-'));
  const jev = new Jev({mode: 'mock', minIntervalMs: 0, maxPerMinute: 1000, logFile: path.join(dir, 'calls.jsonl')});
  let requests = 0;
  jev.backend.evaluate = async () => {
    requests++;
    return {answers: {decision: {type: 'choice', choice: 'BIDE', probabilities: {BIDE: 1}}}, usage: {inputTokens: 1}};
  };
  const state = {recentDialog: ['The move is disabled!']};
  for (const purpose of ['battle', 'battle-menu', 'menu', 'battle']) {
    await jev.choose(purpose, state, 'Choose', {BIDE: 'Usable', GROWL: 'Status move'});
    await jev.choose(purpose, state, 'Choose', {BIDE: 'Usable', GROWL: 'Status move'});
  }
  assert.equal(requests, 8);
  assert.equal(jev.cacheHits, 0);
  await jev.choose('overworld', state, 'Choose', {BIDE: 'Usable', GROWL: 'Status move'});
  await jev.choose('overworld', state, 'Choose', {BIDE: 'Usable', GROWL: 'Status move'});
  assert.equal(requests, 9);
  assert.equal(jev.cacheHits, 1);
});
