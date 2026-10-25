import { FACT_LABELS, type FactKey, type ProjectFacts } from "@/lib/types";

const ORDER: FactKey[] = ["time", "role", "stack", "status"];

export function Facts({ facts }: { facts: ProjectFacts }) {
  return (
    <dl className="facts">
      {ORDER.map((key) => (
        <div className="facts-cell" key={key}>
          <dt className="facts-label">{FACT_LABELS[key]}</dt>
          <dd className="facts-value" style={{ margin: 0 }}>
            {facts[key] || <span className="muted">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
