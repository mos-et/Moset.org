import React, { createContext, useContext, useState, useEffect } from "react";

export type AgentMode = "planear" | "actuar";
export type ContextMode = "none" | "selected" | "project";
export type AIProviderName = "soberano" | "nube" | "custom";

export interface IdeConfigState {
  agentMode: AgentMode;
  setAgentMode: (mode: AgentMode) => void;
  
  includeContext: boolean;
  setIncludeContext: (include: boolean) => void;
  
  contextMode: ContextMode;
  setContextMode: (mode: ContextMode) => void;
  
  maxTokens: number;
  setMaxTokens: (tokens: number) => void;
  
  contextTokens: number;
  setContextTokens: (tokens: number) => void;
  
  turboMode: boolean;
  setTurboMode: (t: boolean) => void;
  
  activeProvider: AIProviderName;
  setActiveProvider: (provider: AIProviderName) => void;
  
  customModelId: string;
  setCustomModelId: (id: string) => void;
  
  openRouterKey: string;
  setOpenRouterKey: (key: string) => void;
  
  modelPath: string;
  setModelPath: (path: string) => void;
  
  tokenizerPath: string;
  setTokenizerPath: (path: string) => void;

  customBaseUrl: string;
  setCustomBaseUrl: (url: string) => void;
  
  isModelLoading: boolean;
  setIsModelLoading: (loading: boolean) => void;

  useLocalizationLens: boolean;
  setUseLocalizationLens: (use: boolean) => void;
  lensLanguage: string;
  setLensLanguage: (lang: string) => void;
}

// ─── Context ────────────────────────────────────────────────────────────────────

const IdeConfigContext = createContext<IdeConfigState | null>(null);

/**
 * Hook para consumir el estado global del IDE.
 * Debe ser usado dentro de un <IdeConfigProvider>.
 */
export function useIdeConfig(): IdeConfigState {
  const ctx = useContext(IdeConfigContext);
  if (!ctx) {
    throw new Error("useIdeConfig debe ser usado dentro de un <IdeConfigProvider>");
  }
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────────────

export function IdeConfigProvider({ children }: { children: React.ReactNode }) {
  const [agentMode, setAgentMode] = useState<AgentMode>(
    () => (localStorage.getItem("moset_agent_mode") as AgentMode) || "planear"
  );
  const [includeContext, setIncludeContext] = useState(
    () => localStorage.getItem("moset_include_context") === "true"
  );
  const [contextMode, setContextMode] = useState<ContextMode>(
    () => (localStorage.getItem("moset_context_mode") as ContextMode) || "selected"
  );
  const [maxTokens, setMaxTokens] = useState(() => 
    parseInt(localStorage.getItem("moset_max_tokens") || "2048", 10)
  );
  const [contextTokens, setContextTokens] = useState(() => 
    parseInt(localStorage.getItem("moset_context_tokens") || "4096", 10)
  );
  const [turboMode, setTurboMode] = useState(
    () => localStorage.getItem("moset_turbo_mode") === "true"
  );
  
  const [activeProvider, setActiveProvider] = useState<AIProviderName>(
    () => (localStorage.getItem("moset_ai_provider") as AIProviderName) || "soberano"
  );
  const [customModelId, setCustomModelId] = useState(
    () => localStorage.getItem("moset_custom_model_id") || "anthropic/claude-3.5-sonnet"
  );
  const [openRouterKey, setOpenRouterKey] = useState(
    () => localStorage.getItem("moset_openrouter_api_key") || ""
  );
  const [modelPath, setModelPath] = useState(
    () => localStorage.getItem("moset_model_path") || ""
  );
  const [tokenizerPath, setTokenizerPath] = useState(
    () => localStorage.getItem("moset_tokenizer_path") || ""
  );
  const [customBaseUrl, setCustomBaseUrl] = useState(
    () => localStorage.getItem("moset_custom_base_url") || ""
  );
  const [isModelLoading, setIsModelLoading] = useState(false);

  const [useLocalizationLens, setUseLocalizationLens] = useState(
    () => localStorage.getItem("moset_localization_lens") === "true"
  );
  const [lensLanguage, setLensLanguage] = useState(
    () => localStorage.getItem("moset_lens_language") || "en"
  );

  // Sync states globally when another window/tab changes localStorage
  useEffect(() => {
    const handleSettingsUpdate = () => {
      setAgentMode((localStorage.getItem("moset_agent_mode") as AgentMode) || "planear");
      setIncludeContext(localStorage.getItem("moset_include_context") === "true");
      setContextMode((localStorage.getItem("moset_context_mode") as ContextMode) || "selected");
      setMaxTokens(parseInt(localStorage.getItem("moset_max_tokens") || "2048", 10));
      setContextTokens(parseInt(localStorage.getItem("moset_context_tokens") || "4096", 10));
      setTurboMode(localStorage.getItem("moset_turbo_mode") === "true");
      setActiveProvider((localStorage.getItem("moset_ai_provider") as AIProviderName) || "soberano");
      setCustomModelId(localStorage.getItem("moset_custom_model_id") || "anthropic/claude-3.5-sonnet");
      setOpenRouterKey(localStorage.getItem("moset_openrouter_api_key") || "");
      setModelPath(localStorage.getItem("moset_model_path") || "");
      setTokenizerPath(localStorage.getItem("moset_tokenizer_path") || "");
      setCustomBaseUrl(localStorage.getItem("moset_custom_base_url") || "");
      setUseLocalizationLens(localStorage.getItem("moset_localization_lens") === "true");
      setLensLanguage(localStorage.getItem("moset_lens_language") || "en");
    };

    window.addEventListener("storage", handleSettingsUpdate);
    window.addEventListener("moset-settings-updated", handleSettingsUpdate);

    return () => {
      window.removeEventListener("storage", handleSettingsUpdate);
      window.removeEventListener("moset-settings-updated", handleSettingsUpdate);
    };
  }, []);

  // Sincronizar con LocalStorage
  useEffect(() => {
    localStorage.setItem("moset_agent_mode", agentMode);
    localStorage.setItem("moset_include_context", String(includeContext));
    localStorage.setItem("moset_context_mode", contextMode);
    localStorage.setItem("moset_turbo_mode", String(turboMode));
    localStorage.setItem("moset_ai_provider", activeProvider);
    localStorage.setItem("moset_custom_model_id", customModelId);
    localStorage.setItem("moset_max_tokens", String(maxTokens));
    localStorage.setItem("moset_context_tokens", String(contextTokens));
    localStorage.setItem("moset_openrouter_api_key", openRouterKey);
    localStorage.setItem("moset_model_path", modelPath);
    localStorage.setItem("moset_tokenizer_path", tokenizerPath);
    localStorage.setItem("moset_custom_base_url", customBaseUrl);
    localStorage.setItem("moset_lens_language", lensLanguage);
    localStorage.setItem("moset_localization_lens", String(useLocalizationLens));
    
    // Dispatch event for SettingsPanel and other localStorage-based components
    window.dispatchEvent(new Event("moset-settings-updated"));
  }, [
    agentMode, includeContext, contextMode, turboMode, activeProvider, customModelId,
    maxTokens, contextTokens, openRouterKey, modelPath, tokenizerPath, customBaseUrl, lensLanguage, useLocalizationLens
  ]);

  const value: IdeConfigState = {
    agentMode, setAgentMode,
    includeContext, setIncludeContext,
    contextMode, setContextMode,
    turboMode, setTurboMode,
    maxTokens, setMaxTokens,
    contextTokens, setContextTokens,
    activeProvider, setActiveProvider,
    customModelId, setCustomModelId,
    openRouterKey, setOpenRouterKey,
    modelPath, setModelPath,
    tokenizerPath, setTokenizerPath,
    customBaseUrl, setCustomBaseUrl,
    isModelLoading, setIsModelLoading,
    useLocalizationLens, setUseLocalizationLens,
    lensLanguage, setLensLanguage,
  };

  return React.createElement(IdeConfigContext.Provider, { value }, children);
}
