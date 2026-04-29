import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DiffEditor } from "@monaco-editor/react";
import { Icons } from "./ChatIcons";

// ─── Helpers ──────────────────────────────────────────────────────────────────
// NOTE: processStreamChunk / sanitizeStreamChunk lives in chatUtils.ts (single source of truth).
// Do NOT duplicate it here.

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const combined = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0; let key = 0; let m: RegExpExecArray | null;
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[0].startsWith("**")) parts.push(<strong key={key++}>{m[2]}</strong>);
    else parts.push(<code key={key++} className="chat-inline-code">{m[3]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

export function ActionCard({ filepath, code, lang, projectRoot }: { filepath: string; code: string; lang: string; projectRoot?: string | null }) {
  const [status, setStatus] = useState<"pending" | "applied" | "rejected">("pending");
  const [expanded, setExpanded] = useState(false);
  const [originalCode, setOriginalCode] = useState<string | null>(null);

  const isAbsolute = filepath.match(/^[a-zA-Z]:\\/) || filepath.startsWith("/");
  const absolutePath = isAbsolute ? filepath : (projectRoot ? `${projectRoot}/${filepath}`.replace(/\\/g, "/") : filepath);
  const displayPath = absolutePath.split(/[/\\]/).slice(-2).join("/");

  useEffect(() => {
    let active = true;
    invoke<string>("read_file_content", { path: absolutePath }).then((res: string) => {
      if (active) setOriginalCode(res);
    }).catch((_: any) => {
      if (active) setOriginalCode("");
    });
    return () => { active = false; };
  }, [absolutePath]);

  const handleApply = async () => {
    try {
      await invoke("save_file_content", { path: absolutePath, content: code });
      setStatus("applied");
    } catch (e) {
      alert("Error aplicando cambio: " + e);
    }
  };

  return (
    <div className={"action-card action-card-" + status}>
      <div className="action-card-header">
        <div className="action-card-file">
          {Icons.file}
          <span className="action-card-path">{displayPath}</span>
        </div>
        <div className="action-card-btns">
          {status === "pending" && (
            <>
              <button className="action-btn action-btn-apply" onClick={handleApply}>{Icons.check} Aplicar</button>
              <button className="action-btn action-btn-reject" onClick={() => setStatus("rejected")}>{Icons.close} Rechazar</button>
            </>
          )}
          {status === "applied" && (lang === "moset" || absolutePath.endsWith(".et")) && (
            <button className="action-btn action-btn-apply" onClick={() => {
              window.dispatchEvent(new CustomEvent("run-moset-code", { detail: { codigo: code, language: "moset", filename: displayPath } }));
            }}>▶ Ejecutar</button>
          )}
        </div>
      </div>
      <div className="action-card-code">
        {expanded && originalCode !== null ? (
          <div className="action-card-diff">
            <DiffEditor original={originalCode} modified={code} language={lang || "text"} theme="vs-dark" options={{ minimap: { enabled: false } }} />
          </div>
        ) : (
          <pre><code>{code.split("\n").slice(0, 8).join("\n")}</code></pre>
        )}
        {!expanded && code.split("\n").length > 8 && (
          <button className="action-expand-btn" onClick={() => setExpanded(true)}>{Icons.expand} Ver completo</button>
        )}
      </div>
    </div>
  );
}

// (ToolInterceptorCard remoted in favor of unified grouped execution)

export function ThoughtBlock({ content, isClosed }: { content: string, isClosed: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="thought-block">
      <div className={`thought-header ${expanded ? 'open' : ''}`} onClick={() => setExpanded(!expanded)}>
        {isClosed ? Icons.brain : <span className="thinking-dots">...</span>}
        <span>{isClosed ? "Razonamiento" : "Pensando..."}</span>
        {isClosed && (
          <span style={{ marginLeft: 'auto', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'flex' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        )}
      </div>
      {(expanded || !isClosed) && <div className="thought-content">{content}</div>}
    </div>
  );
}

export function ArtifactBlock({ name, content, onOpenArtifact }: { name: string, content: string, onOpenArtifact?: (n: string, c: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="action-card action-card-applied" style={{ marginBottom: "10px" }}>
      <div className="action-card-header">
        <div className="action-card-file">
          {Icons.file}
          <span className="action-card-path">{name}</span>
        </div>
        <div className="action-card-btns">
          <button className="action-btn" onClick={() => onOpenArtifact && onOpenArtifact(name, content)}>
            {Icons.expand} Pantalla Completa
          </button>
        </div>
      </div>
      <div className="action-card-code">
        {expanded ? (
          <pre style={{ whiteSpace: "pre-wrap" }}><code>{content}</code></pre>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap" }}><code>{content.split("\n").slice(0, 5).join("\n")}{content.split("\n").length > 5 ? "\n..." : ""}</code></pre>
        )}
        {!expanded && content.split("\n").length > 5 && (
          <button className="action-expand-btn" onClick={() => setExpanded(true)} style={{ marginTop: "5px" }}>
            {Icons.expand} Ver completo
          </button>
        )}
        {expanded && (
          <button className="action-expand-btn" onClick={() => setExpanded(false)} style={{ marginTop: "5px" }}>
            Contraer
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Content Renderer ─────────────────────────────────────────────────────────

export function renderContent(text: string, isActionable: boolean = false, projectRoot?: string | null, isPendingGroup: boolean = false, onOpenArtifact?: (n: string, c: string) => void): React.ReactNode {
  const parts: React.ReactNode[] = [];
  
  // Expresión regular que captura cualquiera de los bloques especiales
  const regex = /(<(?:think|thought|razonamiento|pensamiento)>[\s\S]*?(?:<\/(?:think|thought|razonamiento|pensamiento)>|$)|(?:[\s\S]*?)<\/(?:think|thought|razonamiento|pensamiento)>|\[ARTIFACT:[^\]]+\][\s\S]*?(?:\[\/ARTIFACT\]|\[\/ARTACT\]|$)|<system_response>[\s\S]*?<\/system_response>|<system_action>[\s\S]*?<\/system_action>)/gi;

  const tokens = text.split(regex);

  let keyCounter = 0;

  tokens.forEach(token => {
    if (!token) return;

    if (token.match(/^<(?:think|thought|razonamiento|pensamiento)>/i)) {
      const isClosed = token.match(/<\/(?:think|thought|razonamiento|pensamiento)>$/i) !== null;
      const content = token.replace(/^<(?:think|thought|razonamiento|pensamiento)>/i, "").replace(/<\/(?:think|thought|razonamiento|pensamiento)>$/i, "");
      parts.push(<ThoughtBlock key={keyCounter++} content={content} isClosed={isClosed} />);
    } 
    else if (token.match(/<\/(?:think|thought|razonamiento|pensamiento)>$/i)) {
      // orphaned closing tag
      const content = token.replace(/<\/(?:think|thought|razonamiento|pensamiento)>$/i, "");
      parts.push(<ThoughtBlock key={keyCounter++} content={content.trim()} isClosed={true} />);
    }
    else if (token.match(/^\[ARTIFACT:/i)) {
      const match = token.match(/^\[ARTIFACT:([^\]]+)\]([\s\S]*?)(?:\[\/ARTIFACT\]|\[\/ARTACT\]|$)/i);
      if (match) {
        parts.push(<ArtifactBlock key={keyCounter++} name={match[1].trim()} content={match[2].trim()} onOpenArtifact={onOpenArtifact} />);
      }
    }
    else if (token.match(/^<system_response>/i)) {
      const content = token.replace(/^<system_response>/i, "").replace(/<\/system_response>$/i, "");
      parts.push(
        <div key={keyCounter++} className="system-response-block" style={{ marginTop: "10px", padding: "10px", background: "var(--bg-tertiary, rgba(255,255,255,0.05))", borderLeft: "3px solid var(--accent, #4cc9f0)", borderRadius: "4px", fontSize: "12px", fontFamily: "monospace", overflowX: "auto" }}>
          <div style={{ opacity: 0.7, marginBottom: "5px", display: "flex", alignItems: "center", gap: "5px", fontWeight: "bold" }}>
            {Icons.naraka} <span>Respuesta del Sistema</span>
          </div>
          <div style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>{content.trim()}</div>
        </div>
      );
    }
    else if (token.match(/^<system_action>/i)) {
      const content = token.replace(/^<system_action>/i, "").replace(/<\/system_action>$/i, "");
      try {
        const cleanContent = content.trim().replace(/^```\w*\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleanContent);
        if (parsed && parsed.tool) {
          const argsSummary = Object.entries(parsed.args || {}).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(", ");
          const isReadOnly = ["read_file", "read_directory", "list_processes", "semantic_search"].includes(parsed.tool);
          
          parts.push(
            <div key={keyCounter++} className={`tool-card ${isPendingGroup ? 'tool-card-pending' : 'tool-card-approved'}`}>
              <div className="tool-card-header">
                <span>{Icons.zap} {parsed.tool}</span>
                <span style={{opacity: 0.6, fontSize: '11px', marginLeft: 'auto'}}>
                  {isPendingGroup ? '⏳ Pendiente' : (isReadOnly ? '⚡ Auto' : '✅ Ejecutado')}
                </span>
              </div>
              {argsSummary && <div style={{padding: '4px 12px 8px', fontSize: '11px', opacity: 0.5, fontFamily: 'monospace'}}>{argsSummary}</div>}
            </div>
          );
        }
      } catch {
        parts.push(<div key={keyCounter++} className="chat-code-block"><pre><code>{content.trim()}</code></pre></div>);
      }
    }
    else {
      // Normal text rendering
      const lines = token.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("```")) {
          const lang = line.slice(3).trim();
          let code = ""; i++;
          while (i < lines.length && !lines[i].startsWith("```")) { code += lines[i] + "\n"; i++; }
          parts.push(<div key={keyCounter++} className="chat-code-block"><pre><code>{code}</code></pre></div>);
        } else if (line.trim()) {
          parts.push(<p key={keyCounter++}>{renderInline(line)}</p>);
        }
      }
    }
  });
  return <>{parts}</>;
}
