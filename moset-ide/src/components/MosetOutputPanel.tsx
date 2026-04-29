import { useEffect, useRef, useState } from "react";
import "./MosetOutputPanel.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OutputLine {
  type: "quantum" | "molde" | "header" | "text" | "error" | "separator";
  content: string;
}

export interface MosetOutput {
  lines: OutputLine[];
}

interface MosetOutputPanelProps {
  output: MosetOutput | null;
  error: string | null;
  fileName: string;
  isRunning: boolean;
  onClose: () => void;
}

// ─── Quantum Line ─────────────────────────────────────────────────────────────

function QuantumLine({ content }: { content: string }) {
  // Parse "Nombre: Bit:[0.85] [████████░░] 85%"
  const barMatch = content.match(/\[([█░]+)\]/);
  const percentMatch = content.match(/(\d+)%/);
  const probMatch = content.match(/Bit:\[([0-9.~]+)\]/);

  const bar = barMatch?.[1] ?? "";
  const percent = percentMatch?.[1] ?? "50";
  const prob = probMatch?.[1] ?? "~";
  const filledCount = (bar.match(/█/g) || []).length;
  const totalCount = bar.length || 10;
  const fillPct = (filledCount / totalCount) * 100;

  // Extract label prefix (everything before "Bit:")
  const labelMatch = content.match(/^(.+?)Bit:/);
  const label = labelMatch?.[1]?.trim().replace(/:$/, "") ?? "";

  // Color based on probability
  const color = fillPct > 75
    ? "#7c3aed"
    : fillPct > 40
    ? "#2563eb"
    : "#1e40af";

  return (
    <div className="mop-quantum-row">
      <div className="mop-quantum-label">
        <span className="mop-quantum-icon">⟨ψ⟩</span>
        <span>{label || content.split("Bit:")[0].trim()}</span>
      </div>
      <div className="mop-quantum-bar-wrap">
        <div className="mop-quantum-bar">
          <div
            className="mop-quantum-bar-fill"
            style={{ width: `${fillPct}%`, background: color }}
          />
        </div>
        <span className="mop-quantum-pct" style={{ color }}>
          {prob === "~" ? "50%" : `${percent}%`}
        </span>
        <span className="mop-quantum-prob">
          {prob === "~" ? "·· superposición ··" : `p = ${prob}`}
        </span>
      </div>
    </div>
  );
}

// ─── Molde Line ───────────────────────────────────────────────────────────────

function MoldeLine({ content }: { content: string }) {
  // Parse "NombreMolde { campo: valor, campo2: valor2 }"
  const structMatch = content.match(/^(\w+)\s*\{(.+)\}$/s);
  if (!structMatch) {
    return <div className="mop-molde-raw">{content}</div>;
  }
  const [, name, fields] = structMatch;
  const fieldPairs = fields.split(",").map(f => f.trim()).filter(Boolean);

  return (
    <div className="mop-molde">
      <div className="mop-molde-header">
        <span className="mop-molde-icon">◈</span>
        <span className="mop-molde-name">{name}</span>
        <span className="mop-molde-badge">molde</span>
      </div>
      <div className="mop-molde-fields">
        {fieldPairs.map((pair, i) => {
          const colonIdx = pair.indexOf(":");
          const key = pair.slice(0, colonIdx).trim();
          const val = pair.slice(colonIdx + 1).trim();
          const isExtra = key.startsWith("+");
          return (
            <div key={i} className={`mop-molde-field ${isExtra ? "extra" : ""}`}>
              <span className="mop-field-key">{isExtra ? key.slice(1) : key}</span>
              <span className="mop-field-sep">·</span>
              <span className="mop-field-val">{val}</span>
              {isExtra && <span className="mop-field-extra-tag">núcleo</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Header Line ──────────────────────────────────────────────────────────────

function HeaderLine({ content }: { content: string }) {
  const text = content.replace(/^=+\s*/, "").replace(/\s*=+$/, "");
  return (
    <div className="mop-header">
      <div className="mop-header-line" />
      <span className="mop-header-text">{text}</span>
      <div className="mop-header-line" />
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function MosetOutputPanel({
  output,
  error,
  fileName,
  isRunning,
  onClose,
}: MosetOutputPanelProps) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, error]);

  const handleCopy = () => {
    const text = output?.lines.map(l => l.content).join("\n") ?? error ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="mop-overlay" onClick={onClose}>
      <div className="mop-panel" onClick={e => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="mop-topbar">
          <div className="mop-topbar-left">
            <span className="mop-topbar-logo">⬡</span>
            <div className="mop-topbar-info">
              <span className="mop-topbar-title">MOSET RUN</span>
              <span className="mop-topbar-file">{fileName}</span>
            </div>
          </div>
          <div className="mop-topbar-right">
            {isRunning && (
              <span className="mop-running-badge">
                <span className="mop-pulse" />
                ejecutando...
              </span>
            )}
            <button className="mop-btn-copy" onClick={handleCopy} title="Copiar output">
              {copied ? "✓ copiado" : "⎘ copiar"}
            </button>
            <button className="mop-btn-close" onClick={onClose} title="Cerrar">✕</button>
          </div>
        </div>

        {/* ── Output body ── */}
        <div className="mop-body" ref={scrollRef}>
          {isRunning && !output && !error && (
            <div className="mop-loading">
              <div className="mop-spinner" />
              <span>Inicializando motor Moset...</span>
            </div>
          )}

          {error && (
            <div className="mop-error-block">
              <div className="mop-error-icon">⚠</div>
              <div className="mop-error-content">
                <div className="mop-error-title">Error de ejecución</div>
                <pre className="mop-error-msg">{error}</pre>
              </div>
            </div>
          )}

          {!error && output && (
            <div className="mop-lines">
              {output.lines.map((line, i) => {
                if (line.type === "header") {
                  return <HeaderLine key={i} content={line.content} />;
                }
                if (line.type === "quantum") {
                  return <QuantumLine key={i} content={line.content} />;
                }
                if (line.type === "molde") {
                  return <MoldeLine key={i} content={line.content} />;
                }
                if (line.type === "separator") {
                  return <div key={i} className="mop-sep" />;
                }
                if (line.type === "error") {
                  return (
                    <div key={i} className="mop-line-error">
                      <span className="mop-line-error-icon">✕</span>
                      {line.content}
                    </div>
                  );
                }
                return (
                  <div key={i} className="mop-line-text">
                    {line.content}
                  </div>
                );
              })}
            </div>
          )}

          {!isRunning && !output && !error && (
            <div className="mop-empty">
              <span className="mop-empty-icon">⬡</span>
              <span>Sin output</span>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {output && !isRunning && (
          <div className="mop-footer">
            <span className="mop-footer-ok">● Proceso finalizado</span>
            <span>{output.lines.filter(l => l.type !== "separator").length} líneas</span>
          </div>
        )}
      </div>
    </div>
  );
}
