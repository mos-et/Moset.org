import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { flushSync } from "react-dom";
import { sanitizeStreamChunk, toBackendProvider } from "../utils/chatUtils";
import { IdeConfigState, AIProviderName } from "./useIdeConfig";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_RENDER_CHARS = 15000;

// ─── Interfaces ────────────────────────────────────────────────────────────────
export interface ChatMessage {
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
  config?: {
    aiProvider?: AIProviderName;
    customModelId?: string;
    maxTokens?: number;
    contextTokens?: number;
    openRouterKey?: string;
    customBaseUrl?: string;
    customApiKey?: string;
  };
}

function uid(): string { return crypto.randomUUID(); }

export function useSoberanoChat(ideConfig: IdeConfigState, projectRoot?: string | null, contextPaths?: string[]) {
  const {
    agentMode, includeContext, maxTokens, contextTokens, activeProvider,
    customModelId, openRouterKey, modelPath, tokenizerPath, customBaseUrl
  } = ideConfig;

  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: uid(), title: "Nueva Conversación", messages: [], ts: Date.now() }
  ]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Cargar sesiones desde disco al iniciar (una sola vez)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw: string = await invoke("load_chat_sessions");
        if (cancelled) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
        } else {
          // Migración: si hay datos en localStorage, importarlos
          const legacy = localStorage.getItem("moset_chat_sessions");
          if (legacy) {
            try {
              const legacyParsed = JSON.parse(legacy);
              if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
                setSessions(legacyParsed);
              }
            } catch { /* ignorar localStorage corrupto */ }
            localStorage.removeItem("moset_chat_sessions");
          }
        }
      } catch (e) {
        console.warn("Error cargando sesiones desde disco:", e);
        // Fallback a localStorage legacy
        const legacy = localStorage.getItem("moset_chat_sessions");
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            if (!cancelled && Array.isArray(parsed) && parsed.length > 0) setSessions(parsed);
          } catch { /* ignorar */ }
        }
      }
      if (!cancelled) setSessionsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]?.id || uid());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [lastMetrics, setLastMetrics] = useState<{ prompt_eval_count: number, eval_count: number } | null>(null);

  const streamBufferRef = useRef("");
  const streamBlockedRef = useRef(false);
  const listenerRef = useRef<(() => void) | null>(null);
  const lastRenderRef = useRef<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = activeSession ? activeSession.messages : [];

  const setMessages = (newValue: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setSessions(prevSessions => prevSessions.map(session => {
      if (session.id === activeSessionId) {
        const nextMessages = typeof newValue === 'function' ? newValue(session.messages) : newValue;
        let nextTitle = session.title;
        if (session.title === "Nueva Conversación" || session.title === "Chat Original") {
          const firstUserMsg = nextMessages.find(m => m.role === "user");
          if (firstUserMsg) {
            nextTitle = firstUserMsg.content.slice(0, 45).trim() + "...";
          }
        }
        return { ...session, messages: nextMessages, title: nextTitle, ts: Date.now() };
      }
      return session;
    }));
  };

  // Persistir sesiones a disco (debounced)
  useEffect(() => {
    if (!sessionsLoaded) return; // No guardar antes de la carga inicial
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      invoke("save_chat_sessions", { data: JSON.stringify(sessions) })
        .catch(e => console.error("Error guardando sesiones a disco:", e));
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [sessions, sessionsLoaded]);

  useEffect(() => {
    let cancelled = false;
    // listenerRef now holds an array of unlisten functions
    const unlisteners: Array<() => void> = [];

    (async () => {
      try {
        const unlistenStream = await listen<string>("soberano-stream", (event) => {
          if (cancelled || streamBlockedRef.current) return;
          const result = sanitizeStreamChunk(streamBufferRef.current, event.payload);
          if (result.blocked) {
            streamBlockedRef.current = true;
            streamBufferRef.current = result.text;
            setStreamBuffer(result.text);
            return;
          }
          streamBufferRef.current = result.text;

          const now = Date.now();
          if (now - lastRenderRef.current > 40) {
            setStreamBuffer(result.text);
            lastRenderRef.current = now;
          }
        });

        if (cancelled) unlistenStream();
        else unlisteners.push(unlistenStream);

        const unlistenMetrics = await listen<any>("soberano-metrics", (event) => {
          if (cancelled) return;
          setLastMetrics(event.payload);
        });

        if (cancelled) unlistenMetrics();
        else unlisteners.push(unlistenMetrics);

      } catch (e) { console.error("No se pudo iniciar listener de stream", e); }
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach(unlisten => unlisten());
    };
  }, []);

  const sendMessage = async (retryContent?: string) => {
    const messageText = retryContent || input.trim();
    if (!messageText || loading) return;

    // ── Resolve effective config: session overrides > global defaults ──
    const sc = activeSession?.config;
    const effActiveProvider = sc?.aiProvider || activeProvider;
    const effCustomModelId = sc?.customModelId !== undefined ? sc.customModelId : customModelId;
    const effMaxTokens = sc?.maxTokens !== undefined ? sc.maxTokens : maxTokens;
    const effContextTokens = sc?.contextTokens !== undefined ? sc.contextTokens : contextTokens;
    const effOpenRouterKey = sc?.openRouterKey !== undefined ? sc.openRouterKey : openRouterKey;

    const baseMessages = retryContent
      ? messages.filter((m, i) => !(i === messages.length - 1 && m.role === "system"))
      : messages;
    const newMessages = [...baseMessages, { id: uid(), role: "user" as const, content: messageText, ts: Date.now() }];

    setMessages(newMessages);
    if (!retryContent) setInput("");
    setLoading(true);
    setStreamBuffer("");
    setLastMetrics(null);
    streamBufferRef.current = "";
    streamBlockedRef.current = false;

    let contextContent = "";
    if (includeContext && contextPaths && contextPaths.length > 0) {
      try {
        let raw: string = await invoke("fetch_full_context", { paths: contextPaths, query: messageText, maxContextTokens: effContextTokens });
        const maxContextChars = effContextTokens * 4;
        if (raw.length > maxContextChars) {
          raw = raw.slice(0, maxContextChars) + "\n[...contexto truncado a ~" + effContextTokens + " tokens]";
        }
        contextContent = raw;
      } catch (e) {
        console.error("Context fetch error:", e);
      }
    }

    try {
      const isSoberano = effActiveProvider === "soberano";
      const backendProvider = toBackendProvider(effActiveProvider);

      let backendBaseUrl = null;
      let apiKeySetting = "";

      if (!isSoberano) {
        backendBaseUrl = sc?.customBaseUrl || customBaseUrl || "";
        apiKeySetting = sc?.customApiKey || sc?.openRouterKey || effOpenRouterKey || "";
      }

      // Payload messages generated after Auto-Compact check

      let sysPromptBase = localStorage.getItem("moset_pre_prompt");
      if (!sysPromptBase || sysPromptBase.trim() === "") {
        sysPromptBase = "Eres Soberano, la Inteligencia de Moset integrada en Moset IDE. Eres un arquitecto experto en el dialecto Ethér (.et).\n\n" +
          "REGLAS COGNITIVAS:\n" +
          "1. Usa SIEMPRE <thought> para analizar la lógica antes de responder.\n" +
          "2. Sé directo y ultra-eficiente.\n\n" +
          "ESPECIFICACIÓN TÉCNICA ETHER (.ET):\n" +
          "- TOPOLOGÍA: Sin llaves `{}` ni `;`. Usa indentación de 4 espacios.\n" +
          "- MACROS: Usa `:,]` para funciones, `:,[` para errores (Plan B), `:\\` para await y `:@` para comentarios.\n" +
          "- BASE-1: Las listas empiezan en 1.\n" +
          "- TIPOS: Soporta `Bit:~` (cuántico) y `Bit:[prob]`.\n\n" +
          "DIRECTIVA DEL VIGILANTE: Jamás intentes evadir la sandbox local.";
      }

      const hasMosetContext = includeContext && contextPaths && contextPaths.some(p => p.endsWith('.et'));
      if (hasMosetContext) {
        const manifesto = "\n\nMANIFIESTO ETHER (.ET):\n" +
          "Estás trabajando en archivos .et. Reglas estricta:\n" +
          "1. NUNCA uses `{}`. Ejemplo correcto: `si condicion:` seguido de indentación.\n" +
          "2. Funciones: `nombre(args) :,]`.\n" +
          "3. Salida: `mostrar(valor)`.\n" +
          "4. Comentarios: `:@ comentario`.\n" +
          "Usa la sintaxis moderna de macros para inyectar bloques.";
        sysPromptBase += manifesto;
      }

      const hasComplextContext = includeContext && contextPaths && contextPaths.some(p => p.endsWith('.ce'));
      if (hasComplextContext) {
        const complextManifesto = "\n\nMANIFIESTO COMPLEXT (LENGUAJE .CE):\nEstás asistiendo sobre código COMPLEXT (.ce). Reglas:\n1. Usas palabras clave avanzadas: estructura (objeto), operador, lógica, condición y ejecución constante (loop) - todas en MAYÚSCULAS.\n2. Entiendes tipos cuánticos como Fermión/Bosón y Superposición (F~, B~, E~, P~).\n3. Los bloques de código SIEMPRE están envueltos en ```cextracted code```.\n4. Incluye siempre `assert` predefinido por COMPLEXT para unit tests y manejo de excepciones con `throw`.\nTu código debe reflejar un enfoque técnico superior.";
        sysPromptBase += complextManifesto;
      }

      if (contextContent.trim() !== "") {
        sysPromptBase += `\n\n[CONTEXTO DE ARCHIVOS DEL PROYECTO (Resumen/Esqueleto)]:\n(ATENCIÓN: Los siguientes archivos pueden ser resúmenes para ahorrar tokens. Si necesitas ver o modificar la implementación completa de una función, UTILIZA la herramienta 'read_file' en su ruta):\n${contextContent}`;
      }

      const charsInContext = contextContent.length + newMessages.reduce((sum, m) => sum + m.content.length, 0);
      const estimatedUsedTokens = Math.ceil(charsInContext / 4);

      // Auto Compact trigger (80% of context tokens)
      const AUTO_COMPACT_THRESHOLD = 0.80;
      let payloadMessages = newMessages.map(m => ({
        role: m.role === "system" ? "system" : m.role === "user" ? "user" : "assistant",
        content: m.content
      }));

      if (estimatedUsedTokens > (effContextTokens * AUTO_COMPACT_THRESHOLD) && newMessages.length > 6) {
        const sysPrompts = payloadMessages.filter(m => m.role === "system");
        const firstAssistant = payloadMessages.find(m => m.role === "assistant");
        const recentMessages = payloadMessages.slice(-4);

        let preservedMessages = [...sysPrompts];
        if (firstAssistant && !recentMessages.includes(firstAssistant)) {
          preservedMessages.push({ role: "assistant", content: "[PLAN ORIGINAL PRESERVADO]: " + firstAssistant.content.substring(0, 1000) + "..." });
        }

        // Auto-compresión avanzada: inyectamos un mensaje del sistema pidiendo a la IA que tenga en cuenta el truncamiento
        // En lugar de solo perder la memoria, informamos a la IA explícitamente para que actúe en consecuencia.
        payloadMessages = [
          ...preservedMessages,
          { role: "system", content: "[AUTO COMPACT EVENT]: Has consumido el 90% de tu contexto. El historial antiguo fue descartado. Si el usuario hace referencia a contexto perdido, adviértele que la sesión se ha auto-comprimido por gestión de tokens. Concéntrate solo en la última petición." },
          ...recentMessages
        ];

        setMessages(prev => {
          const sys = prev.filter(m => m.role === "system");
          const firstAsst = prev.find(m => m.role === "assistant");
          const recent = prev.slice(-4);

          let preserved = [...sys];
          if (firstAsst && !recent.includes(firstAsst)) {
            preserved.push(firstAsst);
          }

          return [
            ...preserved,
            { id: uid(), role: "system", content: "⚡ Auto Compact: Se ha activado la Auto-Compresión para evitar errores de contexto. El historial antiguo ha sido descartado.", ts: Date.now() },
            ...recent
          ];
        });
      }

      const remainingTokens = Math.max(50, effContextTokens - estimatedUsedTokens);

      const dimensionalVigilance = `\nDIRECTIVA DE VIGILANCIA DIMENSIONAL:\nPRESUPUESTO DINÁMICO: Tienes un remanente calculado de ~${remainingTokens} tokens de contexto libre (basado en un CONTEXT_TOKENS de ${effContextTokens} menos ${estimatedUsedTokens} consumidos por el historial y archivos cargados). Trata de ser conciso.`;
      sysPromptBase += dimensionalVigilance;

      const autoCompactEvents = payloadMessages.filter(m => m.role === "system" && m.content.includes("[AUTO COMPACT"));
      payloadMessages = payloadMessages.filter(m => m.role !== "system");

      let finalSystemContent = sysPromptBase;
      if (autoCompactEvents.length > 0) {
        finalSystemContent += `\n\n${autoCompactEvents[0].content}`;
      }

      const qPensarEnabled = localStorage.getItem("moset_q_pensar") === "true" || localStorage.getItem("moset_q_pensar") === null;
      if (qPensarEnabled && agentMode !== "actuar") {
        finalSystemContent += "\n\n[DIRECTIVA COGNITIVA ESTRICTA (ESTILO ANTIGRAVITY)]:\nAntes de generar la respuesta final dirigida al usuario, DEBES usar una etiqueta <thought>...</thought> donde realizarás todo tu análisis lógico, arquitectónico y deductivo. No muestres código final aquí ni te dirijas al usuario. Tu respuesta limpia (sin ruido) deberá escribirse inmediatamente después de cerrar la etiqueta </thought>.";
      } else if (agentMode === "actuar") {
        finalSystemContent += "\n\n[DIRECTIVA AGENTE AUTÓNOMO ESTRUCTURADO (MODO ANTIGRAVITY)]:\nEres un motor de ejecución y agente autónomo integrado profundamente en el entorno de Moset IDE.\n\n" +
          "FLUJO DE TRABAJO OBLIGATORIO:\n" +
          "1. AUDITORÍA: Analiza el problema y el código usando `<thought>`. Si necesitas modificar un archivo, DEBES leerlo completo primero con `read_file` porque tu contexto puede estar resumido.\n" +
          "2. EJECUCIÓN: Utiliza herramientas mediante `<system_action>` paso a paso para resolver la tarea inmediatamente. NO pidas permiso para ejecutar, ACTÚA.\n\n" +
          "REGLAS ESTRUCTURALES OBLIGATORIAS:\n" +
          "Para interactuar con el entorno, usa el tag XML <system_action> que contenga un objeto JSON válido.\n" +
          "Ejemplo:\n" +
          "<system_action>\n" +
          "{\n" +
          "  \"tool\": \"run_command\",\n" +
          "  \"args\": {\n" +
          "    \"command\": \"echo 'Autonomía Activada'\"\n" +
          "  }\n" +
          "}\n" +
          "</system_action>\n\n" +
          "HERRAMIENTAS PERMITIDAS:\n" +
          "1. 'run_command': Ejecuta comandos locales. args: { \"command\": \"str\" }\n" +
          "2. 'read_file': Lee contenido de un archivo. args: { \"path\": \"str\" }\n" +
          "3. 'write_file': Sobrescribe un archivo. args: { \"path\": \"str\", \"content\": \"str\" }\n" +
          "4. 'replace_file_content': Reemplaza substring exacto. args: { \"path\": \"str\", \"targetContent\": \"str\", \"replacementContent\": \"str\" }\n" +
          "5. 'read_directory': Lista archivos. args: { \"path\": \"str\" }\n" +
          "6. 'git_commit': Hace add y commit automático. args: { \"path\": \"str\", \"message\": \"str\" }\n" +
          "7. 'list_processes': Lista procesos activos (tasklist/ps). args: {}\n" +
          "8. 'inject_gguf_ui': Inyecta o edita un metadato en el editor GGUF del IDE. args: { \"key\": \"str\", \"type\": \"string\"|\"int32\"|\"float32\"|\"bool\", \"value\": cualquier_valor }\n\n" +
          "Usa la etiqueta <thought>...</thought> antes de interactuar con el entorno para estructurar tu razonamiento. OBLIGATORIO: Asegúrate de que el JSON no contenga errores de sintaxis y que estés usando la herramienta correcta.";
      }

      if (finalSystemContent !== "") {
        payloadMessages.unshift({ role: "system", content: finalSystemContent });
      }

      // backendProvider and backendBaseUrl are already set above

      await invoke("chat_orquestado", {
        messages: payloadMessages,
        provider: backendProvider,
        model: effCustomModelId,
        apiKey: apiKeySetting || "",
        baseUrl: backendBaseUrl || null,
        maxTokens: effMaxTokens,
        qCollapseMethod: localStorage.getItem("moset_q_collapse") || "probabilistic",
        qAlpha: parseFloat(localStorage.getItem("moset_q_alpha") || "0.7071"),
        qEntanglement: localStorage.getItem("moset_q_entanglement") === "true",
      });

      const finalContent = streamBufferRef.current;
      const isTruncated = finalContent.length > MAX_RENDER_CHARS;

      flushSync(() => {
        setLoading(false);
        setStreamBuffer("");
        setMessages(prev => [...prev, { id: uid(), role: "assistant", content: finalContent, ts: Date.now(), truncated: isTruncated }]);
      });
    } catch (e: any) {
      console.error(e);
      flushSync(() => {
        setLoading(false);
        setStreamBuffer("");
        setMessages(prev => [...prev, { id: uid(), role: "system", content: `Error en Motor Soberano: ${String(e)}`, ts: Date.now() }]);
      });
    }

    streamBufferRef.current = "";
    streamBlockedRef.current = false;
  };

  const handleStop = async () => {
    try { await invoke("cancel_inference"); } catch (e) { console.error(e); }
  };

  const newChat = () => {
    const newId = uid();
    setSessions(prev => [{ id: newId, title: "Nueva Conversación", messages: [], ts: Date.now() }, ...prev]);
    setActiveSessionId(newId);
  };

  const updateSessionConfig = (newConfig: Partial<ChatSession['config']>) => {
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return { ...s, config: { ...(s.config || {}), ...newConfig } };
      }
      return s;
    }));
  };

  return {
    sessions, setSessions,
    activeSessionId, setActiveSessionId,
    activeSession, messages, setMessages,
    input, setInput,
    loading, streamBuffer,
    lastMetrics,
    sendMessage, handleStop, newChat, updateSessionConfig
  };
}
