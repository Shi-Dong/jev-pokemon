import fs from 'node:fs';
import type { JevBackend, JevRequest, JevResult } from './types.js';

export function optionLabel(index: number): string {
  let result = '';
  for (index++; index > 0; index = Math.floor((index - 1) / 26)) {
    result = String.fromCharCode(65 + (index - 1) % 26) + result;
  }
  return result;
}

export function decode(content: string, labels: string[]): Record<string, number> {
  const value = JSON.parse(content);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected probability object');
  const keys = [...content.matchAll(/("(?:[^"\\]|\\.)*")\s*:/g)].map(m => JSON.parse(m[1]));
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate probability keys');
  if (Object.keys(value).length !== labels.length || labels.some(k => !Object.hasOwn(value, k))) {
    throw new Error('Probability labels differ from legal choices');
  }
  const numbers = Object.values(value);
  if (numbers.some(p => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) {
    throw new Error('Invalid probability');
  }
  const total = (numbers as number[]).reduce((a, b) => a + b, 0);
  // Two-decimal outputs can accumulate up to half a hundredth per option.
  const roundingAllowance = Math.max(0.02, labels.length * 0.005) + 1e-9;
  if (Math.abs(total - 1) > roundingAllowance) throw new Error('Probabilities must sum approximately to one');
  return Object.fromEntries(labels.map(k => [k, value[k] / total]));
}

export class ProbabilityJev implements JevBackend {
  name = 'probability-endpoint';
  async evaluate(req: JevRequest): Promise<JevResult> {
    const endpoint = process.env.JEV_ENDPOINT;
    const model = process.env.JEV_MODEL;
    if (!endpoint || !model) throw new Error('JEV_ENDPOINT and JEV_MODEL are required');
    const answers: JevResult['answers'] = {};
    let inputTokens = 0, outputTokens = 0;
    for (const [id, question] of Object.entries(req.questions)) {
      if (question.type !== 'choice') throw new Error(`Unsupported question type: ${question.type}`);
      const options = Object.entries(question.criteria);
      if (!options.length) throw new Error('No legal options');
      const labels = options.map((_, i) => optionLabel(i));
      const render = (v: unknown): string => typeof v === 'string' ? v : JSON.stringify(v);
      const prompt = `State:\n${render(req.state)}\n\n${render(question.instructions)}\n\nOptions:\n`
        + options.map(([key, facts], i) => `${labels[i]}. ${key}: ${render(facts)}`).join('\n')
        + `\n\nReport your probability for every option as a JSON object with exactly the keys ${labels.map(k => JSON.stringify(k)).join(', ')}. `
        + 'Use finite numbers between 0 and 1 that sum to 1. Report your uncertainty honestly. Output only JSON, without explanation or Markdown.';
      const request = { model, messages: [{ role: 'user', content: prompt }], temperature: 0,
        max_tokens: Math.max(512, 24 * options.length), chat_template_kwargs: { enable_thinking: false } };
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (process.env.JEV_ENDPOINT_KEY) headers.authorization = `Bearer ${process.env.JEV_ENDPOINT_KEY}`;
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(request),
        signal: AbortSignal.timeout(+(process.env.JEV_TIMEOUT_MS ?? 60000)) });
      if (!response.ok) throw new Error(`Decision endpoint HTTP ${response.status}`);
      const result = await response.json();
      fs.appendFileSync('logs/model-responses.jsonl', JSON.stringify({ at: Date.now(), id, request, result }) + '\n');
      const completion = result.choices?.[0];
      if (completion?.finish_reason === 'length' || completion?.message?.reasoning_content) throw new Error('Truncated response or unexpected reasoning');
      const content = completion?.message?.content;
      if (typeof content !== 'string') throw new Error('Missing probability JSON');
      const probabilities = decode(content, labels);
      const mapped = Object.fromEntries(options.map(([key], i) => [key, probabilities[labels[i]]]));
      const choice = options.reduce((best, option, i) => probabilities[labels[i]] > mapped[best] ? option[0] : best, options[0][0]);
      answers[id] = { type: 'choice', choice, probabilities: mapped };
      inputTokens += result.usage?.prompt_tokens ?? 0;
      outputTokens += result.usage?.completion_tokens ?? 0;
    }
    return { answers, usage: { inputTokens, outputTokens } };
  }
}
