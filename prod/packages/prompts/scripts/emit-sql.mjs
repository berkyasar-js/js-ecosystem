// prompts/*.md -> agent_prompts INSERT'leri (global varsayılan: org_id null). Kullanım: npm run prompts:sql > prompts.sql
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
const schemas = {
  board_proposal: { type: 'object', required: ['summary', 'proposals'], properties: { summary: { type: 'string' }, proposals: { type: 'array', items: { type: 'object', required: ['action', 'rationale', 'level', 'risk'] } } } },
  inbox_drafts: { type: 'object', required: ['summary', 'drafts'], properties: { summary: { type: 'string' }, drafts: { type: 'array', items: { type: 'object', required: ['title', 'task_type', 'qty', 'priority', 'due_at'] } } } },
  studio_draft: { type: 'object', required: ['summary', 'concepts'], properties: { summary: { type: 'string' }, concepts: { type: 'array', items: { type: 'object', required: ['title', 'idea', 'tone'] } } } },
  twin: { type: 'object', required: ['summary'], properties: { summary: { type: 'string' }, fit: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } },
};
const q = (s) => `$prompt$${s}$prompt$`;
const out = ['-- Üretildi: npm run prompts:sql (packages/prompts). Tekrar çalıştırmak güvenlidir: aynı sürüm yeniden yazılır.', 'begin;'];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
  const raw = readFileSync(join(dir, f), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${f}: front matter yok`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => l.split(/:\s*/, 2)));
  const schema = schemas[meta.output_schema];
  if (!schema) throw new Error(`${f}: bilinmeyen output_schema ${meta.output_schema}`);
  out.push(
    `delete from public.agent_prompts where org_id is null and agent = '${meta.agent}' and version = ${Number(meta.version)};`,
    `update public.agent_prompts set is_active = false where org_id is null and agent = '${meta.agent}';`,
    `insert into public.agent_prompts (org_id, agent, version, system_prompt, model, output_schema, is_active) values (null, '${meta.agent}', ${Number(meta.version)}, ${q(m[2].trim())}, '${meta.model}', '${JSON.stringify(schema)}'::jsonb, true);`,
  );
}
out.push('commit;');
console.log(out.join('\n'));
