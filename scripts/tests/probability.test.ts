import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { test } from 'node:test';
import { decode, optionLabel } from '../../src/jev/probability.js';
import { Jev } from '../../src/jev/client.js';

test('strict probabilities reject corrupt responses', () => {
  assert.deepEqual(decode('{"A":0.2,"B":0.8}', ['A', 'B']), { A: 0.2, B: 0.8 });
  for (const bad of ['[]', 'null', '{"A":true,"B":0}', '{"A":0.5}',
    '{"A":1,"B":-1}', '{"A":1,"A":0,"B":1}', '{"A":1e400,"B":0}', '```json\n{"A":1,"B":0}\n```']) {
    assert.throws(() => decode(bad, ['A', 'B']), bad);
  }
  const rounded = decode('{"A":0.4,"B":0.59}', ['A', 'B']);
  assert.ok(Math.abs(rounded.A + rounded.B - 1) < 1e-10);
  assert.ok(rounded.B > rounded.A);
  const many = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [optionLabel(i), 0.04]));
  const normalized = decode(JSON.stringify(many), Object.keys(many));
  assert.ok(Math.abs(Object.values(normalized).reduce((a,b) => a+b, 0) - 1) < 1e-10);
  assert.deepEqual(decode('{"A":0.2,"B":0.2}', ['A', 'B']), { A: 0.5, B: 0.5 });
  const under = decode('{"A":0.6,"B":0.3}', ['A', 'B']);
  assert.ok(under.A > under.B);
  assert.ok(Math.abs(under.A + under.B - 1) < 1e-10);
  const over = decode('{"A":0.8,"B":0.8}', ['A', 'B']);
  assert.deepEqual(over, { A: 0.5, B: 0.5 });
  assert.throws(() => decode('{"A":0,"B":0}', ['A', 'B']));
  assert.deepEqual([0, 25, 26, 27, 701].map(optionLabel), ['A', 'Z', 'AA', 'AB', 'ZZ']);
});

test('HTTP adapter survives the actual Jev consumer and maps native action keys', async () => {
  fs.mkdirSync('logs', { recursive: true });
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.chat_template_kwargs.enable_thinking, false);
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
    assert.match(body.messages[0].content, /A\. move-1: Tackle/);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"A":0.225,"B":0.675}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.JEV_ENDPOINT = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/v1/chat/completions`;
  process.env.JEV_MODEL = 'test-model';
  const client = new Jev({ mode: 'endpoint', minIntervalMs: 0, maxPerMinute: 100, logFile: 'logs/adapter-test.jsonl' });
  try {
    const answer = await client.chooseP('battle', { foe: 'Rattata' }, 'Choose a move', { 'move-1': 'Tackle', 'move-2': 'Ember' });
    assert.equal(answer.choice, 'move-2');
    assert.deepEqual(answer.probabilities, { 'move-1': 0.25, 'move-2': 0.75 });
    assert.equal(client.calls, 1);
    assert.equal(client.inputTokens, 10);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
