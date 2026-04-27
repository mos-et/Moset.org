import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useIdeConfig, AgentMode, AIProviderName } from "./hooks/useIdeConfig";
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
  const [showInlineSettings, setShowInlineSettings] = useState(false);
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

  // ─── Loop Controller Autónomo (Turbo Mode) ──────────────────────────
  const loopIterationRef = useRef(0);
  const lastProcessedMsgIdRef = useRef<string>("");
  const MAX_LOOP_ITERATIONS = 15;

  useEffect(() => {
    if (chat.loading || !ideConfig.turboMode) return;
    if (chat.messages.length === 0) return;

    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg.role !== "assistant") return;
    if (lastMsg.id === lastProcessedMsgIdRef.current) return;

    const actionRegex = /<system_action>([\s\S]*?)<\/system_action>/gi;
    const matches = [...lastMsg.content.matchAll(actionRegex)];
    if (matches.length === 0) {
      loopIterationRef.current = 0;
      return;
    }

    // Válvula de seguridad
    if (loopIterationRef.current >= MAX_LOOP_ITERATIONS) {
      console.warn("[Moset Agent] ⛔ Límite de seguridad alcanzado (", MAX_LOOP_ITERATIONS, "iteraciones). Loop detenido.");
      loopIterationRef.current = 0;
      return;
    }

    lastProcessedMsgIdRef.current = lastMsg.id;
    loopIterationRef.current++;

    const executeSequential = async () => {
      const results: string[] = [];
      for (const match of matches) {
        try {
          const parsed = JSON.parse(match[1].trim());
          if (parsed && parsed.tool) {
            try {
              const res = await invoke<string>("execute_agent_tool", { call: parsed });
              results.push(`[${parsed.tool}] ✓\n${res}`);
            } catch (e) {
              results.push(`[${parsed.tool}] ✗ Error:\n${e}`);
            }
          }
        } catch {
          results.push(`[parse_error] JSON inválido en system_action`);
        }
      }

      const feedback = `<system_response>\n${results.join("\n---\n")}\n</system_response>`;
      chat.sendMessage(feedback);
    };

    executeSequential();
  }, [chat.messages, chat.loading, ideConfig.turboMode]);

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

  return (
    <ChatDropZone isDragOver={isDragOver} setIsDragOver={setIsDragOver} contextPaths={contextPaths} setContextPaths={setContextPaths}>
      <div className={`moset-chat-panel ${isFloating ? 'floating' : ''}`}>
        <ChatHeader
          Icons={Icons} lastMetrics={chat.lastMetrics} modelLoading={chat.loading}
          newChat={chat.newChat}
          showHistory={showHistory} setShowHistory={setShowHistory}
          showInlineSettings={showInlineSettings} setShowInlineSettings={setShowInlineSettings}
          isFloating={isFloating} onToggleFloating={onToggleFloating} onDragStart={onDragStart} onClose={onClose}
        />
        {showInlineSettings && (
          <div className="chat-inline-settings-panel">
            <div className="chat-inline-settings-row">
              <label>Motor de Inferencia:</label>
              <select
                value={effectiveIdeConfig.activeProvider}
                onChange={e => chat.updateSessionConfig({ aiProvider: e.target.value as AIProviderName })}
              >
                <option value="soberano">Motor Soberano (Rust/GGUF Local)</option>
                <option value="nube">OpenRouter (Cloud)</option>
                <option value="custom">Custom API (Mistral/Ollama/OpenAI)</option>
              </select>
            </div>

            {effectiveIdeConfig.activeProvider === "soberano" && (
              <>
                <div className="chat-inline-settings-row">
                  <label>Ruta Modelo GGUF (Local):</label>
                  <div style={{ display: "flex", gap: "10px", flex: 1, width: "100%" }}>
                    <input
                      type="text"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder="C:/ruta/modelo.gguf"
                      value={ideConfig.modelPath}
                      onChange={e => ideConfig.setModelPath(e.target.value)}
                    />
                    <button 
                      className="btn-secondary" 
                      style={{ width: "auto", padding: "4px 10px" }}
                      onClick={async () => {
                        try {
                          const { open } = await import("@tauri-apps/plugin-dialog");
                          const selected = await open({ multiple: false, filters: [{ name: "GGUF Models", extensions: ["gguf", "bin"] }] });
                          if (selected && typeof selected === "string") {
                            ideConfig.setModelPath(selected);
                          }
                        } catch (e) { console.error(e); }
                      }}
                    >
                      Examinar
                    </button>
                  </div>
                </div>
                <div className="chat-inline-settings-row">
                  <label>Ruta Tokenizer (JSON):</label>
                  <div style={{ display: "flex", gap: "10px", flex: 1, width: "100%" }}>
                    <input
                      type="text"
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder="C:/ruta/tokenizer.json"
                      value={ideConfig.tokenizerPath}
                      onChange={e => ideConfig.setTokenizerPath(e.target.value)}
                    />
                    <button 
                      className="btn-secondary" 
                      style={{ width: "auto", padding: "4px 10px" }}
                      onClick={async () => {
                        try {
                          const { open } = await import("@tauri-apps/plugin-dialog");
                          const selected = await open({ multiple: false, filters: [{ name: "JSON Files", extensions: ["json"] }] });
                          if (selected && typeof selected === "string") {
                            ideConfig.setTokenizerPath(selected);
                          }
                        } catch (e) { console.error(e); }
                      }}
                    >
                      Examinar
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px", marginBottom: "8px" }}>
                    <button 
                      className="btn-primary" 
                      style={{ padding: "4px 12px", fontSize: "11px", opacity: ideConfig.isModelLoading ? 0.7 : 1, cursor: ideConfig.isModelLoading ? "not-allowed" : "pointer" }}
                      disabled={ideConfig.isModelLoading}
                      onClick={async () => {
                        if (!ideConfig.modelPath || !ideConfig.tokenizerPath) {
                          alert("Selecciona el modelo y el tokenizer primero.");
                          return;
                        }
                        ideConfig.setIsModelLoading(true);
                        try {
                          await invoke("cargar_modelo", { modeloPath: ideConfig.modelPath, tokenizerPath: ideConfig.tokenizerPath });
                          alert("Modelo cargado exitosamente en VRAM.");
                        } catch(e) {
                          alert("Error al cargar modelo: " + e);
                        } finally {
                          ideConfig.setIsModelLoading(false);
                        }
                      }}
                    >
                      {ideConfig.isModelLoading ? "Cargando en VRAM... (Espere)" : "Cargar en VRAM"}
                    </button>
                </div>
              </>
            )}

            {effectiveIdeConfig.activeProvider === "nube" && (
              <>
                <div className="chat-inline-settings-row">
                  <label>ID Modelo OpenRouter:</label>
                  {isLoadingModels ? (
                    <span style={{ fontSize: "12px", color: "var(--text-2)", padding: "4px" }}>Cargando modelos...</span>
                  ) : availableModels.length > 0 ? (
                    <select
                      value={activeSessionConfig.customModelId || ""}
                      onChange={e => chat.updateSessionConfig({ customModelId: e.target.value })}
                    >
                      <option value="">-- Seleccionar Modelo --</option>
                      {availableModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="ej: anthropic/claude-3.5-sonnet"
                      value={activeSessionConfig.customModelId !== undefined ? activeSessionConfig.customModelId : ""}
                      onChange={e => chat.updateSessionConfig({ customModelId: e.target.value })}
                    />
                  )}
                </div>
                <div className="chat-inline-settings-row">
                  <label>OpenRouter API Key:</label>
                  <input
                    type="password"
                    placeholder="sk-or-v1-..."
                    value={activeSessionConfig.openRouterKey !== undefined ? activeSessionConfig.openRouterKey : ideConfig.openRouterKey}
                    onChange={e => chat.updateSessionConfig({ openRouterKey: e.target.value })}
                  />
                </div>
              </>
            )}

            {effectiveIdeConfig.activeProvider === "custom" && (
              <>
                <div className="chat-inline-settings-row">
                  <label>ID del Modelo:</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", width: "100%", flex: 1 }}>
                    {isLoadingModels ? (
                      <span style={{ fontSize: "12px", color: "var(--text-2)", padding: "4px" }}>Cargando modelos...</span>
                    ) : availableModels.length > 0 ? (
                      <select
                        value={activeSessionConfig.customModelId || ""}
                        onChange={e => chat.updateSessionConfig({ customModelId: e.target.value })}
                      >
                        <option value="">-- Seleccionar Modelo --</option>
                        {availableModels.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="Ej: mistral-large-latest"
                        value={activeSessionConfig.customModelId !== undefined ? activeSessionConfig.customModelId : ""}
                        onChange={e => chat.updateSessionConfig({ customModelId: e.target.value })}
                      />
                    )}
                    {modelsError && <span style={{ fontSize: "10px", color: "#f87171" }}>{modelsError}</span>}
                  </div>
                </div>
                <div className="chat-inline-settings-row">
                  <label>Custom Base URL:</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", width: "100%", flex: 1 }}>
                    <input
                      type="text"
                      placeholder="Ej: https://api.mistral.ai/v1"
                      value={activeSessionConfig.customBaseUrl || ""}
                      onChange={e => chat.updateSessionConfig({ customBaseUrl: e.target.value })}
                    />
                    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "2px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-2)", alignSelf: "center", marginRight: "4px" }}>Presets:</span>
                      <button className="btn-secondary" style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => chat.updateSessionConfig({ customBaseUrl: "https://openrouter.ai/api/v1" })}>OpenRouter</button>
                      <button className="btn-secondary" style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => chat.updateSessionConfig({ customBaseUrl: "https://api.mistral.ai/v1" })}>Mistral</button>
                      <button className="btn-secondary" style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => chat.updateSessionConfig({ customBaseUrl: "https://api.groq.com/openai/v1" })}>Groq</button>
                      <button className="btn-secondary" style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => chat.updateSessionConfig({ customBaseUrl: "http://localhost:11434/v1" })}>Ollama</button>
                      <button className="btn-secondary" style={{ fontSize: "10px", padding: "2px 6px" }} onClick={() => chat.updateSessionConfig({ customBaseUrl: "http://localhost:1234/v1" })}>LM Studio</button>
                    </div>
                  </div>
                </div>
                <div className="chat-inline-settings-row">
                  <label>Custom API Key:</label>
                  <input
                    type="password"
                    placeholder="Tu llave API..."
                    value={activeSessionConfig.customApiKey || ""}
                    onChange={e => chat.updateSessionConfig({ customApiKey: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="chat-inline-settings-row">
              <label>Tokens de Contexto (Def: {ideConfig.contextTokens}):</label>
              <input
                type="number" step="512" min="512"
                value={effectiveIdeConfig.contextTokens}
                onChange={e => chat.updateSessionConfig({ contextTokens: parseInt(e.target.value) || 2048 })}
              />
            </div>
            <div className="chat-inline-settings-row">
              <label>Tokens Max Output (Def: {ideConfig.maxTokens}):</label>
              <input
                type="number" step="512" min="512"
                value={effectiveIdeConfig.maxTokens}
                onChange={e => chat.updateSessionConfig({ maxTokens: parseInt(e.target.value) || 1024 })}
              />
            </div>
            <div className="chat-inline-settings-row" style={{ flex: 0, minWidth: 'auto', borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '5px', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <button
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => chat.updateSessionConfig({ maxTokens: undefined, contextTokens: undefined, aiProvider: undefined, customModelId: undefined, openRouterKey: undefined, customBaseUrl: undefined, customApiKey: undefined })}
              >
                Resetear a Global
              </button>
              <button
                className="btn-primary"
                style={{ fontSize: '11px', padding: '4px 12px' }}
                onClick={() => setShowInlineSettings(false)}
              >
                Guardar
              </button>
            </div>
          </div>
        )}
        {showHistory && (
          <div className="chat-tabs-container">
            <ChatAgentTabs sessions={chat.sessions} activeSessionId={chat.activeSessionId} setActiveSessionId={chat.setActiveSessionId} setSessions={chat.setSessions} Icons={Icons} />
          </div>
        )}
        <div className="chat-messages">
          {chat.messages.map((m, idx) => (
            <div key={idx} className={`chat-msg ${m.role}`} style={{ position: "relative" }}>
              <div className="chat-msg-content">{renderContent(m.content, true, projectRoot, handleToolExecuted, ideConfig.turboMode, onOpenArtifact)}</div>
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
          ))}
          {chat.loading && !chat.streamBuffer && (
            <div className="chat-thinking" style={{ opacity: 0.7, fontStyle: "italic", fontSize: "13px", padding: "10px" }}>
              <span className="spinner-icon">⚡</span> Procesando contexto en VRAM/RAM (puede tardar en contextos largos)...
            </div>
          )}
          {chat.streamBuffer && (
            <div className="chat-msg assistant">
              <div className="chat-msg-content">{renderContent(chat.streamBuffer, true, projectRoot, handleToolExecuted, ideConfig.turboMode, onOpenArtifact)}</div>
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