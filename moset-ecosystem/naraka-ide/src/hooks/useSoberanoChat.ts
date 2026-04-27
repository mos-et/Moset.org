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
    customModelId, openRouterKey, modelPath, tokenizerPath
  } = ideConfig;

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem("moset_chat_sessions");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.warn("Invalid chat sessions cache"); }
    }
    return [{ id: uid(), title: "Nueva Conversación", messages: [], ts: Date.now() }];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]?.id || uid());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [lastMetrics, setLastMetrics] = useState<{prompt_eval_count: number, eval_count: number} | null>(null);

  const streamBufferRef = useRef("");
  const streamBlockedRef = useRef(false);
  const listenerRef = useRef<(() => void) | null>(null);
  const lastRenderRef = useRef<number>(0);

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

  useEffect(() => {
    localStorage.setItem("moset_chat_sessions", JSON.stringify(sessions));
  }, [sessions]);

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
      const isCustom = effActiveProvider === "custom";
      const backendProvider = toBackendProvider(effActiveProvider); 
      
      let backendBaseUrl = null;
      let apiKeySetting = "";
      
      if (isCustom) {
         backendBaseUrl = sc?.customBaseUrl || localStorage.getItem("moset_openai_base_url") || "";
         apiKeySetting = sc?.customApiKey || localStorage.getItem("moset_mistral_api_key") || localStorage.getItem("moset_openai_api_key") || "";
      } else if (!isSoberano) {
         backendBaseUrl = "https://openrouter.ai/api/v1";
         apiKeySetting = effOpenRouterKey;
      }

      // Payload messages generated after Auto-Compact check

      let sysPromptBase = localStorage.getItem("moset_pre_prompt");
      if (!sysPromptBase || sysPromptBase.trim() === "") {
        sysPromptBase = "Eres Naraka, la Inteligencia Soberana integrada en Moset IDE. Eres un arquitecto experto y tu proceso cognitivo debe estar ESTRICTAMENTE encapsulado.\n\nREGLAS COGNITIVAS:\n1. Usa SIEMPRE la etiqueta <thought> para estructurar tu razonamiento matemático y analizar la arquitectura antes de responder.\n2. Tu respuesta final (fuera de <thought>) debe ser extremadamente directa, sin saludos ni ruido. Sé ultra eficiente con los tokens.\n\nCONTEXTO DE DOMINIO (LENGUAJE MOSET):\n1. Escribes código EXCLUSIVAMENTE en Moset (.et).\n2. Moset usa palabras clave en español: molde (clase), metodo (función), mientras (while), si/sino (if/else), imprimir (print), retornar (return).\n3. Entiendes nativamente tipos cuánticos (Bit:~) y bloques de simulación (pensar {}).\n4. Los bloques de código SIEMPRE deben estar envueltos en ```moset.\n\nDIRECTIVA DEL VIGILANTE:\nOperas bajo una sandbox estricta ('El Vigilante'). Jamás propongas código que intente evadir el aislamiento del sistema de archivos local ni ejecutar procesos huérfanos sin cierres limpios.";
      }
      
      const hasMosetContext = includeContext && contextPaths && contextPaths.some(p => p.endsWith('.et'));
      if (hasMosetContext) {
        const manifesto = "\n\nMANIFIESTO MOSET (LENGUAJE .ET):\nEstás asistiendo sobre código Moset (.et), el lenguaje omníglota de Naraka Studio. Reglas:\n1. Tipado dinámico automático.\n2. Definición global: `moset variable = valor`.\n3. Mutación local: `variable = valor`.\n4. Condicionales base: `si (condicion) { ... } sino { ... }` o `if / else`.\n5. Bucle: `mientras (condicion) { ... }` o `while`.\n6. Funciones: `funcion nombre(args) { retornar ... }`.\n7. Imprimir salida: `mostrar(...)`.\nUsa las palabras clave nativas en el idioma del usuario (priorizando español si no es obvio). Puedes escribir y corregir código Moset fluidamente.";
        sysPromptBase += manifesto;
      }

      const hasComplextContext = includeContext && contextPaths && contextPaths.some(p => p.endsWith('.ce'));
      if (hasComplextContext) {
        const complextManifesto = "\n\nMANIFIESTO COMPLEXT (LENGUAJE .CE):\nEstás asistiendo sobre código COMPLEXT (.ce). Reglas:\n1. Usas palabras clave avanzadas: estructura (objeto), operador, lógica, condición y ejecución constante (loop) - todas en MAYÚSCULAS.\n2. Entiendes tipos cuánticos como Fermión/Bosón y Superposición (F~, B~, E~, P~).\n3. Los bloques de código SIEMPRE están envueltos en ```cextracted code```.\n4. Incluye siempre `assert` predefinido por COMPLEXT para unit tests y manejo de excepciones con `throw`.\nTu código debe reflejar un enfoque técnico superior.";
        sysPromptBase += complextManifesto;
      }

      if (contextContent.trim() !== "") {
        sysPromptBase += `\n\n[CONTEXTO DE ARCHIVOS DEL PROYECTO]:\n${contextContent}`;
      }

      const charsInContext = contextContent.length + newMessages.reduce((sum, m) => sum + m.content.length, 0);
      const estimatedUsedTokens = Math.ceil(charsInContext / 4);
      
      // Auto Compact trigger (80% of context tokens)
      const AUTO_COMPACT_THRESHOLD = 0.80;
      let payloadMessages = newMessages.map(m => ({
        role: m.role === "system" ? "system" : m.role === "user" ? "user" : "assistant",
        content: m.content
      }));

      // If we are over the threshold and have enough messages to compact
      if (estimatedUsedTokens > (effContextTokens * AUTO_COMPACT_THRESHOLD) && newMessages.length > 6) {
        const sysPrompts = payloadMessages.filter(m => m.role === "system");
        const recentMessages = payloadMessages.slice(-4);
        
        // Auto-compresión avanzada: inyectamos un mensaje del sistema pidiendo a la IA que tenga en cuenta el truncamiento
        // En lugar de solo perder la memoria, informamos a la IA explícitamente para que actúe en consecuencia.
        payloadMessages = [
          ...sysPrompts,
          { role: "system", content: "[AUTO COMPACT EVENT]: Has consumido el 90% de tu contexto. El historial antiguo fue descartado. Si el usuario hace referencia a contexto perdido, adviértele que la sesión se ha auto-comprimido por gestión de tokens. Concéntrate solo en la última petición." },
          ...recentMessages
        ];
        
        setMessages(prev => {
           const sys = prev.filter(m => m.role === "system");
           const recent = prev.slice(-4);
           return [
             ...sys,
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
        finalSystemContent += "\n\n[DIRECTIVA AGENTE AUTÓNOMO ESTRUCTURADO (MODO ANTIGRAVITY)]:\nEres un motor de ejecución y agente autónomo integrado profundamente en el entorno de Naraka IDE.\n\n" +
          "FLUJO DE TRABAJO OBLIGATORIO (PLANNING MODE):\n" +
          "1. AUDITORÍA: Analiza el problema y el código existente usando `<think>`.\n" +
          "2. PLAN DE IMPLEMENTACIÓN: Presenta al usuario un plan detallado de cómo vas a resolver la tarea.\n" +
          "3. PERMISO: DEBES pedir permiso explícito al usuario antes de proceder con el plan.\n" +
          "4. EJECUCIÓN: Solo después de que el usuario apruebe, utiliza herramientas mediante `<system_action>`.\n\n" +
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
          "7. 'list_processes': Lista procesos activos (tasklist/ps). args: {}\n\n" +
          "Usa la etiqueta <think>...</think> antes de interactuar con el entorno para estructurar tu razonamiento.";
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
    activeSession, messages,
    input, setInput,
    loading, streamBuffer,
    lastMetrics,
    sendMessage, handleStop, newChat, updateSessionConfig
  };
}
