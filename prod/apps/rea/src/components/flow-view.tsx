import type { DigestItem, Flow } from '@/lib/types';

const CONF: Record<string, string> = { yüksek: 'chip-ok', orta: 'chip-warn', düşük: 'chip-bad' };

export function EvidenceBlock({ file, line, symbol, snippet, note, kind }: { file?: string | null; line?: number | null; symbol?: string | null; snippet?: string | null; note?: string | null; kind?: string }) {
  return (
    <div className="evidence">
      <div className="where">
        {kind && <span className="chip">{kind}</span>}
        {symbol && <code>{symbol}</code>}
        {file ? <code>{file}{line ? `:${line}` : ''}</code> : <span className="muted">dosya yolu yok</span>}
      </div>
      {snippet && <pre tabIndex={0}>{snippet}</pre>}
      {note && <div className="hint">{note}</div>}
    </div>
  );
}

export function FlowSteps({ flow }: { flow: Flow }) {
  return (
    <ol className="flow">
      {flow.steps.map((s, i) => (
        <li key={i} className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3>{s.title}</h3>
            <span className={`chip ${CONF[s.confidence]}`}>Güven: {s.confidence}</span>
          </div>
          <p>{s.description}</p>
          {s.evidence.length > 0
            ? s.evidence.map((e, j) => <EvidenceBlock key={j} file={e.file} symbol={e.symbol} snippet={e.snippet} />)
            : <div className="evidence"><span className="hint">Bu adım için doğrudan kanıt gösterilmedi — doğrulanması gerekir.</span></div>}
        </li>
      ))}
    </ol>
  );
}

export function ItemList({ items, limit }: { items: DigestItem[]; limit: number }) {
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  return (
    <div className="grid gap-2">
      {shown.map((i, k) => <EvidenceBlock key={k} kind={i.kind} symbol={i.label} file={i.file} line={i.line} snippet={i.snippet} note={i.note} />)}
      {rest.length > 0 && (
        <details className="fold"><summary>{rest.length} kayıt daha</summary><div className="grid gap-2">{rest.map((i, k) => <EvidenceBlock key={k} kind={i.kind} symbol={i.label} file={i.file} line={i.line} snippet={i.snippet} note={i.note} />)}</div></details>
      )}
    </div>
  );
}
