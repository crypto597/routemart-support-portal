import { label } from "./api.js";

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{label(status)}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`badge prio-${priority}`}>{priority}</span>;
}

export function JiraChip({ jira }) {
  if (!jira) return <span className="muted small">—</span>;
  return <span className="chip mono" title="Linked engineering issue in Jira">{jira}</span>;
}

export function AiSourceTag({ source, model }) {
  return (
    <span className={`ai-tag ${source}`}>
      {source === "claude" ? `✦ Claude${model ? ` · ${model}` : ""}` : "⚙ Rules engine (no API key)"}
    </span>
  );
}
