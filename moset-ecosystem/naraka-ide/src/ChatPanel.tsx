import React, { useState, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useIdeConfig } from "./hooks/useIdeConfig";
import { useSoberanoChat } from "./hooks/useSoberanoChat";
import { ChatHeader } from "./components/Chat/ChatHeader";
import { ChatAgentTabs } from "./components/Chat/ChatAgentTabs";
import { ChatDropZone } from "./components/Chat/ChatDropZone";
import { ContextSelector } from "./components/Chat/ContextSelector";
import { DiffEditor } from "@monaco-editor/react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
  truncated?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  ts: number;
}

interface NarakaConfig {
  model: string;
  arch: string;
}

export type AgentMode = "planear" | "actuar";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_RENDER_CHARS = 15000;
const JSON_DUMP_THRESHOLD = 500;

// ─── SVG Icons ──────────────────────────────────────────────────────────
const Icons = {
  naraka: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  folder: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  copy: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  brain: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 0-7 7c0 3 2 5.5 4 7l3 3 3-3c2-1.5 4-4 4-7a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2"/>
    </svg>
  ),
  moset: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  ),
  zap: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  send: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  file: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  alert: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  expand: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  menu: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  stop: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  ),
  refresh: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  history: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  plus: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
    </svg>
  ),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isJsonDump(text: string): boolean {
  if (text.length < JSON_DUMP_THRESHOLD) return false;
  const jsonChars = (text.match(/[{}\[\]":,]/g) || []).length;
  const ratio = jsonChars / text.length;
  if (ratio > 0.25 && text.length > 1000) return true;
  if (text.includes('"added_tokens"') || text.includes('"vocab"') || 
      text.includes('"merges"') || text.includes('"model":{')) return true;
  return false;
}

export function processStreamChunk(accumulated: string, newChunk: string) {
  let combined = accumulated + newChunk;
  if (isJsonDump(combined)) {
    return { 
      text: "[Motor Soberano detectó una respuesta malformada. Esto ocurre cuando el formato del prompt no es compatible con el modelo. Verificá la arquitectura del modelo cargado.]",
      blocked: true 
    };
  }
  
  combined = combined.replace(/<\|im_start\|>assistant/g, "")
    .replace(/<\|im_end\|>/g, "")
    .replace(/<\|im_start\|>/g, "")
    .replace(/<\|end\|>/g, "")
    .replace(/<\|endoftext\|>/g, "")
    .replace(/<\|eot_id\|>/g, "")
    .replace(/<\/s>/g, "")
    .replace(/<human>/gi, "")
    .replace(/<\|start_header_id\|>/gi, "")
    .replace(/im_end>/gi, "")
    .replace(/\|im_start>/gi, "");
  
  return { text: combined, blocked: false };
}

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

function ActionCard({ filepath, code, lang, projectRoot }: { filepath: string; code: string; lang: string; projectRoot?: string | null }) {
  const [status, setStatus] = useState<"pending" | "applied" | "rejected">("pending");
  const [expanded, setExpanded] = useState(false);
  const [originalCode, setOriginalCode] = useState<string | null>(null);

  const isAbsolute = filepath.match(/^[a-zA-Z]:\\/) || filepath.startsWith("/");
  const absolutePath = isAbsolute ? filepath : (projectRoot ? `${projectRoot}/${filepath}`.replace(/\\/g, "/") : filepath);
  const displayPath = absolutePath.split(/[/\\]/).slice(-2).join("/");

  useEffect(() => {
    let active = true;
    invoke<string>("read_file_content", { path: absolutePath }).then(res => {
      if (active) setOriginalCode(res);
    }).catch(_ => {
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
        {status === "pending" && (
          <div className="action-card-btns">
            <button className="action-btn action-btn-apply" onClick={handleApply}>{Icons.check} Aplicar</button>
            <button className="action-btn action-btn-reject" onClick={() => setStatus("rejected")}>{Icons.close} Rechazar</button>
          </div>
        )}
      </div>
      <div className="action-card-code">
        {expanded && originalCode !== null ? (
          <div style={{ height: "300px", width: "100%", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--border)", marginTop: "4px" }}>
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

function ToolInterceptorCard({ toolCall, onToolExecuted }: { toolCall: { tool: string; args: Record<string, any> }, onToolExecuted?: (output: string) => void }) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [output, setOutput] = useState<string>("");
  const [expanded, setExpanded] = useState(false);

  const handleApprove = async () => {
    setStatus("approved");
    try {
      const res = await invoke<string>("execute_agent_tool", { call: toolCall });
      setOutput(res);
      setExpanded(true);
      if (onToolExecuted) onToolExecuted(res);
    } catch (e) {
      setOutput("Error: " + e);
      setExpanded(true);
    }
  };

  return (
    <div className={`tool-card tool-card-${status}`}>
      <div className="tool-card-header" onClick={() => setExpanded(!expanded)}>
        <span>{Icons.zap} {toolCall.tool}</span>
        {status === "pending" && (
          <div className="tool-btns">
            <button onClick={handleApprove}>{Icons.check} Permitir</button>
            <button onClick={() => setStatus("rejected")}>{Icons.close} Denegar</button>
          </div>
        )}
      </div>
      {expanded && output && <pre className="tool-output">{output}</pre>}
    </div>
  );
}

function ThoughtBlock({ content, isClosed }: { content: string, isClosed: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="thought-block">
      <div className="thought-header" onClick={() => setExpanded(!expanded)}>
        {isClosed ? Icons.brain : <span className="thinking-dots">...</span>}
        <span>{isClosed ? "Razonamiento" : "Pensando..."}</span>
      </div>
      {(expanded || !isClosed) && <div className="thought-content">{content}</div>}
    </div>
  );
}

function renderContent(text: string, isActionable: boolean = false, projectRoot?: string | null, onToolExecuted?: (o: string) => void, onOpenArtifact?: (n: string, c: string) => void): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let processedText = text;

  processedText = processedText.replace(/(?:<)?(?:think|thought)>([\s\S]*?)((?:<\/)?(?:think|thought)>|$)/gi, (_m, content, closing) => {
    const isClosed = closing.toLowerCase().includes("think>") || closing.toLowerCase().includes("thought>");
    parts.push(<ThoughtBlock key={parts.length} content={content} isClosed={isClosed} />);
    return "";
  });

  const lines = processedText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      let code = ""; i++;
      while (i < lines.length && !lines[i].startsWith("```")) { code += lines[i] + "\n"; i++; }
      parts.push(<div key={i} className="chat-code-block"><pre><code>{code}</code></pre></div>);
    } else if (line.trim()) {
      parts.push(<p key={i}>{renderInline(line)}</p>);
    }
  }
  return <>{parts}</>;
}

function AgentModeSelector({ mode, onChange }: { mode: AgentMode; onChange: (m: AgentMode) => void }) {
  return (
    <div className="agent-mode-selector">
      <button className={`agent-mode-btn ${mode === "planear" ? "active" : ""}`} onClick={() => onChange("planear")}>{Icons.brain} Planear</button>
      <button className={`agent-mode-btn ${mode === "actuar" ? "active" : ""}`} onClick={() => onChange("actuar")}>{Icons.zap} Actuar</button>
    </div>
  );
}

export default function ChatPanel({ projectRoot, contextPaths, setContextPaths, onClose, onOpenArtifact, isFloating, onToggleFloating, onDragStart }: {
  projectRoot?: string | null;
  contextPaths?: string[];
  setContextPaths?: React.Dispatch<React.SetStateAction<string[]>>;
  onClose?: () => void;
  onOpenArtifact?: (name: string, content: string) => void;
  isFloating?: boolean;
  onToggleFloating?: () => void;
  onDragStart?: (e: React.MouseEvent) => void;
}) {
  const ideConfig = useIdeConfig();
  const [showHistory, setShowHistory] = useState(true);
  const [showInlineSettings, setShowInlineSettings] = useState(false);

  // Determinar contextos efectivos
  const effectiveContextPaths = useMemo(() => {
    if (ideConfig.contextMode === "none") return [];
    if (ideConfig.contextMode === "project") return projectRoot ? [projectRoot] : [];
    return contextPaths || [];
  }, [ideConfig.contextMode, contextPaths, projectRoot]);

  // Sincronizar includeContext con contextMode
  useEffect(() => {
    if (ideConfig.contextMode === "none") {
      if (ideConfig.includeContext) ideConfig.setIncludeContext(false);
    } else {
      if (!ideConfig.includeContext) ideConfig.setIncludeContext(true);
    }
  }, [ideConfig.contextMode, ideConfig]);

  // Asegurar que modo cambie a 'selected' automáticamente si se elige un archivo/directorio con el Cerebro
  useEffect(() => {
    if (contextPaths && contextPaths.length > 0 && ideConfig.contextMode === "none") {
      ideConfig.setContextMode("selected");
    }
  }, [contextPaths, ideConfig.contextMode, ideConfig]);

  const chat = useSoberanoChat(ideConfig, projectRoot, effectiveContextPaths);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [config] = useState<NarakaConfig>({ model: "Motor Soberano", arch: "" });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.streamBuffer]);

  return (
    <ChatDropZone isDragOver={isDragOver} setIsDragOver={setIsDragOver} contextPaths={contextPaths} setContextPaths={setContextPaths}>
      <div className={`moset-chat-panel ${isFloating ? 'floating' : ''}`}>
        <ChatHeader 
          Icons={Icons} config={config} lastMetrics={chat.lastMetrics} modelLoading={chat.loading}
          newChat={chat.newChat}
          showHistory={showHistory} setShowHistory={setShowHistory}
          showInlineSettings={showInlineSettings} setShowInlineSettings={setShowInlineSettings}
          isFloating={isFloating} onToggleFloating={onToggleFloating} onDragStart={onDragStart} onClose={onClose}
        />
        {showHistory && (
          <div className="chat-tabs-container">
            <ChatAgentTabs sessions={chat.sessions} activeSessionId={chat.activeSessionId} setActiveSessionId={chat.setActiveSessionId} setSessions={chat.setSessions} Icons={Icons} />
          </div>
        )}
        <div className="chat-messages">
          {chat.messages.map((m, idx) => (
            <div key={idx} className={`chat-msg ${m.role}`}>
              <div className="chat-msg-content">{renderContent(m.content, true, projectRoot)}</div>
            </div>
          ))}
          {chat.loading && <div className="chat-thinking">Pensando...</div>}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-area">
          <AgentModeSelector mode={ideConfig.agentMode} onChange={ideConfig.setAgentMode} />
          <div className="chat-input-wrapper">
            <textarea 
              ref={textareaRef}
              value={chat.input} 
              onChange={e => chat.setInput(e.target.value)} 
              placeholder="Escribe un mensaje..." 
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && chat.sendMessage()} 
            />
              <div className="chat-input-actions">
                <ContextSelector 
                  Icons={Icons} 
                  mode={ideConfig.contextMode} 
                  onChange={ideConfig.setContextMode} 
                />
                <button className="send-btn" onClick={() => chat.sendMessage()}>{Icons.send}</button>
              </div>
          </div>
        </div>
      </div>
    </ChatDropZone>
  );
}