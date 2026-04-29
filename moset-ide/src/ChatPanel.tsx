import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useIdeConfig } from "./hooks/useIdeConfig";
import { useSoberanoChat, ChatSession, ChatMessage } from "./hooks/useSoberanoChat";
import { ChatHeader } from "./components/Chat/ChatHeader";
import { ChatAgentTabs } from "./components/Chat/ChatAgentTabs";
import { ChatDropZone } from "./components/Chat/ChatDropZone";
import { ContextSelector } from "./components/Chat/ContextSelector";
import { Icons } from "./components/Chat/ChatIcons";
import { renderContent } from "./components/Chat/ChatMessageRenderer";
import { AgentModeSelector } from "./components/Chat/AgentModeSelector";
import { useModelDiscovery } from "./hooks/useModelDiscovery";
import { useMacros, MacroItem } from "./hooks/useMacros";
import { MacroDialog, MacroVariablesDialog } from "./components/Chat/MacroDialog";
import "./styles/components/ChatPanel.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_RENDER_CHARS = 15000;

// processStreamChunk canonical: chatUtils.ts

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
  const chat = useSoberanoChat(ideConfig, projectRoot, contextPaths);
  const activeSessionConfig = chat.activeSession?.config || {};

  // Macros
  const { macros, listMacros, readMacro, extractVariables, interpolateVariables } = useMacros(projectRoot || null);
  const [showMacroDialog, setShowMacroDialog] = useState(false);
  const [showMacroVarsDialog, setShowMacroVarsDialog] = useState(false);
  const [selectedMacro, setSelectedMacro] = useState<MacroItem | null>(null);
  const [macroTemplate, setMacroTemplate] = useState('');
  const [macroVars, setMacroVars] = useState<string[]>([]);

  // ─── Model Discovery (cached, TTL 5min) ─────────────────────────────
  const { models: availableModels, loading: isLoadingModels, error: modelsError } = useModelDiscovery(
    activeSessionConfig.aiProvider || ideConfig.activeProvider,
    activeSessionConfig.customBaseUrl || "",
    activeSessionConfig.openRouterKey || ideConfig.openRouterKey || activeSessionConfig.customApiKey || ""
  );

  // Callback para modo Manual: la card interactiva ejecuta la herramienta y reinyecta el resultado
  const handleToolExecuted = useCallback((res: string) => {
    chat.sendMessage(`<system_response>\n${res}\n</system_response>`);
  }, [chat]);

  // ─── Loop Controller Autónomo y Semi-Autónomo ──────────────────────────
  const loopIterationRef = useRef(0);
  const lastProcessedMsgIdRef = useRef<string>("");
  const consecutiveFailuresRef = useRef<number>(0);
  const MAX_LOOP_ITERATIONS = 15;
  const [pendingGroupApproval, setPendingGroupApproval] = useState<{ msgId: string, matches: RegExpMatchArray[] } | null>(null);
  const [executingTools, setExecutingTools] = useState<boolean>(false);

  useEffect(() => {
    if (chat.loading) return;
    if (chat.messages.length === 0) return;

    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg.role !== "assistant") return;
    if (lastMsg.id === lastProcessedMsgIdRef.current) return;
    if (pendingGroupApproval?.msgId === lastMsg.id) return; // Ya está esperando aprobación

    const actionRegex = /<system_action>([\s\S]*?)<\/system_action>/gi;
    const matches = [...lastMsg.content.matchAll(actionRegex)];
    if (matches.length === 0) {
      loopIterationRef.current = 0;
      return;
    }

    // Comprobar si requiere aprobación manual
    let requiresManual = false;
    if (!ideConfig.turboMode && ideConfig.agentMode !== "actuar") {
      for (const match of matches) {
        try {
          let parsed;
          try {
            const rawMatch = match[1].trim();
            const cleanMatch = rawMatch.replace(/^\s*```\w*\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            parsed = JSON.parse(cleanMatch);
          } catch (e) {
            const fallbackMatch = match[1].match(/\{[\s\S]*\}/);
            if (fallbackMatch) {
              parsed = JSON.parse(fallbackMatch[0]);
            }
          }
          if (parsed && parsed.tool) {
            const isReadOnly = ["read_file", "read_directory", "list_processes", "semantic_search", "get_gguf_metadata"].includes(parsed.tool);
            if (!isReadOnly) {
              requiresManual = true;
              break;
            }
          }
        } catch {}
      }
    }

    if (requiresManual) {
      setPendingGroupApproval({ msgId: lastMsg.id, matches });
      return;
    }

    // Válvula de seguridad
    if (loopIterationRef.current >= MAX_LOOP_ITERATIONS) {
      console.warn("[Moset Agent] ⛔ Límite de seguridad alcanzado (", MAX_LOOP_ITERATIONS, "iteraciones). Loop detenido.");
      loopIterationRef.current = 0;
      return;
    }

    executeGroup(matches, lastMsg.id);
  }, [chat.messages, chat.loading, ideConfig.turboMode, ideConfig.agentMode, pendingGroupApproval]);

  const executeGroup = async (matches: RegExpMatchArray[], msgId: string) => {
    setPendingGroupApproval(null);
    setExecutingTools(true);
    lastProcessedMsgIdRef.current = msgId;
    loopIterationRef.current++;

    const results: string[] = [];
    let hasError = false;
    for (const match of matches) {
      try {
        let parsed;
        try {
          const rawMatch = match[1].trim();
          const cleanMatch = rawMatch.replace(/^\s*```\w*\s*/i, '').replace(/\s*```\s*$/i, '').trim();
          parsed = JSON.parse(cleanMatch);
        } catch (e) {
          const fallbackMatch = match[1].match(/\{[\s\S]*\}/);
          if (fallbackMatch) {
            parsed = JSON.parse(fallbackMatch[0]);
          } else {
            throw e;
          }
        }
        if (parsed && parsed.tool) {
          // P3-6: Timeout escalable por tipo de herramienta
          const TOOL_TIMEOUTS: Record<string, number> = {
            read_file: 10000, read_directory: 10000, list_processes: 10000, semantic_search: 10000,
            write_file: 30000, create_file: 30000, replace_in_file: 30000,
            git_commit: 60000, git_push: 60000, git_pull: 60000,
          };
          const timeout = TOOL_TIMEOUTS[parsed.tool] || 30000;
          try {
            const executePromise = invoke<string>("execute_agent_tool", { call: parsed });
            const timeoutPromise = new Promise<string>((_, reject) => 
              setTimeout(() => reject(new Error(`Timeout: La ejecución de ${parsed.tool} excedió el límite de ${timeout / 1000}s.`)), timeout)
            );
            const res = await Promise.race([executePromise, timeoutPromise]);
            results.push(`[${parsed.tool}] ✓\n${res}`);
          } catch (e) {
            hasError = true;
            results.push(`[${parsed.tool}] ✗ Error:\n${e}`);
          }
        }
      } catch (e) {
        hasError = true;
        results.push(`[parse_error] JSON inválido en system_action: ${e}`);
      }
    }

    if (hasError) {
      consecutiveFailuresRef.current++;
    } else {
      consecutiveFailuresRef.current = 0;
    }

    if (consecutiveFailuresRef.current > 2) {
      results.push("\n⛔ [STAGNATION DETECTED]: Has fallado más de 2 veces consecutivas. Detente, analiza el error con <thought>, y usa otra estrategia.");
    }

    setExecutingTools(false);
    const feedback = `<system_response>\n${results.join("\n---\n")}\n</system_response>`;
    chat.sendMessage(feedback);
  };

  const rejectGroup = (msgId: string) => {
    setPendingGroupApproval(null);
    lastProcessedMsgIdRef.current = msgId;
    loopIterationRef.current = 0;
    chat.sendMessage(`<system_response>\n[Usuario]: He denegado la ejecución de estas acciones. Por favor replantea tu plan o detente.\n</system_response>`);
  };

  const effectiveIdeConfig = useMemo(() => ({
    ...ideConfig,
    activeProvider: activeSessionConfig.aiProvider || ideConfig.activeProvider,
    customModelId: activeSessionConfig.customModelId !== undefined ? activeSessionConfig.customModelId : ideConfig.customModelId,
    maxTokens: activeSessionConfig.maxTokens !== undefined ? activeSessionConfig.maxTokens : ideConfig.maxTokens,
    contextTokens: activeSessionConfig.contextTokens !== undefined ? activeSessionConfig.contextTokens : ideConfig.contextTokens
  }), [ideConfig, activeSessionConfig]);

  // Model discovery is handled by useModelDiscovery hook (cached, TTL 5min)

  // Sincronizar includeContext con contextMode
  useEffect(() => {
    if (ideConfig.contextMode === "none") {
      if (ideConfig.includeContext) ideConfig.setIncludeContext(false);
    } else {
      if (!ideConfig.includeContext) ideConfig.setIncludeContext(true);
    }
  }, [ideConfig.contextMode, ideConfig]);

  // Ensure that the mode switches to 'selected' automatically if files are selected
  const previousContextPathsLength = useRef(contextPaths?.length || 0);
  useEffect(() => {
    const currentLength = contextPaths?.length || 0;
    if (currentLength > previousContextPathsLength.current && ideConfig.contextMode === "none") {
      ideConfig.setContextMode("selected");
    }
    previousContextPathsLength.current = currentLength;
  }, [contextPaths]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages, chat.streamBuffer]);

  // Manejo de Macros
  const handleOpenMacros = async () => {
    await listMacros();
    setShowMacroDialog(true);
  };

  const handleSelectMacro = async (macro: MacroItem) => {
    setShowMacroDialog(false);
    try {
      const template = await readMacro(macro.path);
      const vars = extractVariables(template);
      if (vars.length > 0) {
        setSelectedMacro(macro);
        setMacroTemplate(template);
        setMacroVars(vars);
        setShowMacroVarsDialog(true);
      } else {
        // No hay variables, insertar directamente
        chat.setInput((prev) => prev + (prev.length > 0 ? "\n" : "") + template);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMacroVarsSubmit = (values: Record<string, string>) => {
    setShowMacroVarsDialog(false);
    const result = interpolateVariables(macroTemplate, values);
    chat.setInput((prev) => prev + (prev.length > 0 ? "\n" : "") + result);
    setSelectedMacro(null);
    setMacroTemplate('');
    setMacroVars([]);
  };

  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const handleLoadModel = async () => {
    if (!ideConfig.modelPath) {
      chat.setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: "❌ Error: No hay ruta de modelo configurada. Ve a Ajustes.", ts: Date.now() }]);
      return;
    }
    
    chat.setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: "🚀 Cargando modelo de Inteligencia Artificial...", ts: Date.now() }]);
    
    try {
      await invoke("cargar_modelo", { 
        modeloPath: ideConfig.modelPath, 
        tokenizerPath: ideConfig.tokenizerPath 
      });
      setIsModelLoaded(true);
      chat.setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: "✅ Modelo cargado. El sistema está en standby listo para responder.", ts: Date.now() }]);
    } catch (e) {
      chat.setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: `❌ Fallo al cargar motor: ${e}`, ts: Date.now() }]);
    }
  };

  const handleUnloadModel = async () => {
    chat.setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: "♻️ Descargando modelo de la memoria (Unloading)...", ts: Date.now() }]);
    try {
      await invoke("descargar_modelo");
      setIsModelLoaded(false);
      chat.setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: "💤 Motor descargado correctamente.", ts: Date.now() }]);
    } catch (e) {
      chat.setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "system", content: `❌ Error al descargar: ${e}`, ts: Date.now() }]);
    }
  };

  return (
    <ChatDropZone isDragOver={isDragOver} setIsDragOver={setIsDragOver} contextPaths={contextPaths} setContextPaths={setContextPaths}>
      <div className={`moset-chat-panel ${isFloating ? 'floating' : ''}`}>
        <ChatHeader
          Icons={Icons} lastMetrics={chat.lastMetrics} modelLoading={chat.loading}
          newChat={chat.newChat}
          onLoadModel={isModelLoaded ? handleUnloadModel : handleLoadModel}
          isModelLoaded={isModelLoaded}
          showHistory={showHistory} setShowHistory={setShowHistory}
          isFloating={isFloating} onToggleFloating={onToggleFloating} onDragStart={onDragStart} onClose={onClose}
        />
        {showHistory && (
          <div className="chat-tabs-container">
            <ChatAgentTabs sessions={chat.sessions} activeSessionId={chat.activeSessionId} setActiveSessionId={chat.setActiveSessionId} setSessions={chat.setSessions} Icons={Icons} />
          </div>
        )}
        <div className="chat-messages">
          {chat.messages.map((m, idx) => {
            const isPendingMsg = pendingGroupApproval?.msgId === m.id;
            return (
              <div key={idx} className={`chat-msg ${m.role}`} style={{ position: "relative" }}>
                <div className="chat-msg-content">{renderContent(m.content, true, projectRoot, isPendingMsg, onOpenArtifact)}</div>
                {m.role === 'assistant' && (
                  <button
                    className="chat-msg-copy-btn"
                    onClick={() => navigator.clipboard.writeText(m.content)}
                    title="Copiar respuesta"
                    style={{ position: "absolute", bottom: "10px", right: "10px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", color: "var(--text-secondary)", fontSize: "12px", opacity: 0.7 }}
                  >
                    Copiar
                  </button>
                )}
              </div>
            );
          })}
          {pendingGroupApproval && pendingGroupApproval.msgId === chat.messages[chat.messages.length - 1]?.id && (
            <div className="group-approval-card" style={{ padding: "12px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", marginTop: "10px", textAlign: "center" }}>
              <div style={{ marginBottom: "10px", fontSize: "13px", fontWeight: "bold" }}>
                ⚠️ Pausa de Seguridad: Hay {pendingGroupApproval.matches.length} herramienta(s) pendientes de ejecución.
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                <button className="action-btn action-btn-apply" onClick={() => executeGroup(pendingGroupApproval.matches, pendingGroupApproval.msgId)}>
                  {Icons.check} Aprobar Todas
                </button>
                <button className="action-btn action-btn-reject" onClick={() => rejectGroup(pendingGroupApproval.msgId)}>
                  {Icons.close} Denegar
                </button>
              </div>
            </div>
          )}
          {chat.loading && !chat.streamBuffer && !executingTools && (
            <div className="chat-thinking" style={{ opacity: 0.7, fontStyle: "italic", fontSize: "13px", padding: "10px" }}>
              <span className="spinner-icon">⚡</span> Procesando contexto...
            </div>
          )}
          {executingTools && (
            <div className="chat-executing" style={{ opacity: 0.8, fontStyle: "italic", fontSize: "13px", padding: "10px", color: "var(--accent)" }}>
              <span className="spinner-icon">⚙️</span> El Agente está ejecutando acciones en el entorno...
            </div>
          )}
          {chat.streamBuffer && (
            <div className="chat-msg assistant">
              <div className="chat-msg-content">{renderContent(chat.streamBuffer, true, projectRoot, false, onOpenArtifact)}</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-area">
          <AgentModeSelector
            mode={ideConfig.agentMode}
            onChange={ideConfig.setAgentMode}
            contextMode={ideConfig.contextMode}
            onContextChange={ideConfig.setContextMode}
            turboMode={ideConfig.turboMode}
            onTurboChange={ideConfig.setTurboMode}
            Icons={Icons}
          />
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              value={chat.input}
              onChange={e => chat.setInput(e.target.value)}
              placeholder="Escribe un mensaje..."
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && chat.sendMessage()}
              onDragOver={(e) => {
                // Permitir que el drop ocurra sobre el textarea
                if (e.dataTransfer.types.includes("application/moset-path")) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);

                const internalPath = e.dataTransfer.getData("application/moset-path");
                const externalFiles = Array.from(e.dataTransfer.files);
                
                // Procesar cada path (interno o externo)
                const pathsToProcess: string[] = [];
                
                if (internalPath) {
                  pathsToProcess.push(internalPath);
                }
                
                externalFiles.forEach((file: any) => {
                  if (file.path) pathsToProcess.push(file.path);
                });

                if (pathsToProcess.length > 0) {
                  let textToInsert = "";
                  
                  pathsToProcess.forEach(path => {
                    const filename = path.split(/[/\\]/).pop() || path;
                    textToInsert += `[${filename}](${path}) `;
                    
                    if (!contextPaths?.includes(path)) {
                      setContextPaths?.(prev => [...prev, path]);
                    }
                  });

                  // Prender el modo contexto
                  if (localStorage.getItem("moset_context_mode") !== "selected") {
                    localStorage.setItem("moset_context_mode", "selected");
                    window.dispatchEvent(new Event("moset-settings-updated"));
                  }
                  
                  // Insertar el texto en la posición del cursor
                  const target = e.currentTarget;
                  const start = target.selectionStart || chat.input.length;
                  const end = target.selectionEnd || chat.input.length;
                  const newText = chat.input.substring(0, start) + textToInsert + chat.input.substring(end);
                  
                  chat.setInput(newText);
                  
                  // Foco de vuelta al input
                  setTimeout(() => {
                    target.focus();
                    target.selectionStart = target.selectionEnd = start + textToInsert.length;
                  }, 0);
                }
              }}
            />
            <div className="chat-input-actions">
              <button className="send-btn secondary-btn" onClick={handleOpenMacros} title="Insertar Macro (Atajo)">
                /
              </button>
              {chat.loading ? (
                <button className="send-btn stop-btn stop-btn-color" onClick={() => chat.handleStop()}>{Icons.stop}</button>
              ) : (
                <button className="send-btn" onClick={() => chat.sendMessage()}>{Icons.send}</button>
              )}
            </div>
          </div>
        </div>
      </div>

      <MacroDialog
        isOpen={showMacroDialog}
        macros={macros}
        onClose={() => setShowMacroDialog(false)}
        onSelect={handleSelectMacro}
      />

      {selectedMacro && (
        <MacroVariablesDialog
          isOpen={showMacroVarsDialog}
          macroName={selectedMacro.name}
          variables={macroVars}
          onClose={() => setShowMacroVarsDialog(false)}
          onSubmit={handleMacroVarsSubmit}
        />
      )}
    </ChatDropZone>
  );
}