import { useState, useEffect } from "react";

export type AgentMode = "planear" | "actuar";
export type ContextMode = "none" | "selected" | "project";
export type AIProviderName = "soberano" | "cloud" | "ollama" | "lmstudio" | "anthropic";

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
  
  activeProvider: AIProviderName;
  setActiveProvider: (provider: AIProviderName) => void;
  
  cloudApi: string;
  setCloudApi: (api: string) => void;
  
  customModelId: string;
  setCustomModelId: (id: string) => void;
  
  openAiKey: string;
  setOpenAiKey: (key: string) => void;
  
  anthropicKey: string;
  setAnthropicKey: (key: string) => void;
  
  googleKey: string;
  setGoogleKey: (key: string) => void;
  
  modelPath: string;
  setModelPath: (path: string) => void;
  
  tokenizerPath: string;
  setTokenizerPath: (path: string) => void;
  
  groqKey: string;
  setGroqKey: (key: string) => void;
}

export function useIdeConfig(): IdeConfigState {
  const [agentMode, setAgentMode] = useState<AgentMode>("planear");
  const [includeContext, setIncludeContext] = useState(
    () => localStorage.getItem("moset_include_context") === "true"
  );
  const [contextMode, setContextMode] = useState<ContextMode>(
    () => (localStorage.getItem("moset_context_mode") as ContextMode) || "selected"
  );
  const [maxTokens, setMaxTokens] = useState(2048);
  const [contextTokens, setContextTokens] = useState(4096);
  
  const [activeProvider, setActiveProvider] = useState<AIProviderName>(
    () => (localStorage.getItem("moset_ai_provider") as AIProviderName) || "soberano"
  );
  const [cloudApi, setCloudApi] = useState(
    () => localStorage.getItem("moset_cloud_provider") || "openai"
  );
  const [customModelId, setCustomModelId] = useState(
    () => localStorage.getItem("moset_custom_model_id") || ""
  );
  const [openAiKey, setOpenAiKey] = useState(
    () => localStorage.getItem("moset_openai_api_key") || ""
  );
  const [anthropicKey, setAnthropicKey] = useState(
    () => localStorage.getItem("moset_anthropic_api_key") || ""
  );
  const [googleKey, setGoogleKey] = useState(
    () => localStorage.getItem("moset_google_api_key") || ""
  );
  const [groqKey, setGroqKey] = useState(
    () => localStorage.getItem("moset_groq_api_key") || ""
  );
  
  const [modelPath, setModelPath] = useState(
    () => localStorage.getItem("moset_model_path") || ""
  );
  const [tokenizerPath, setTokenizerPath] = useState(
    () => localStorage.getItem("moset_tokenizer_path") || ""
  );

  // Sincronizar con LocalStorage
  useEffect(() => {
    localStorage.setItem("moset_include_context", String(includeContext));
    localStorage.setItem("moset_context_mode", contextMode);
    localStorage.setItem("moset_ai_provider", activeProvider);
    localStorage.setItem("moset_cloud_provider", cloudApi);
    localStorage.setItem("moset_custom_model_id", customModelId);
    localStorage.setItem("moset_openai_api_key", openAiKey);
    localStorage.setItem("moset_anthropic_api_key", anthropicKey);
    localStorage.setItem("moset_google_api_key", googleKey);
    localStorage.setItem("moset_groq_api_key", groqKey);
    localStorage.setItem("moset_model_path", modelPath);
    localStorage.setItem("moset_tokenizer_path", tokenizerPath);
  }, [
    includeContext, contextMode, activeProvider, cloudApi, customModelId, 
    openAiKey, anthropicKey, googleKey, groqKey, modelPath, tokenizerPath
  ]);

  return {
    agentMode, setAgentMode,
    includeContext, setIncludeContext,
    contextMode, setContextMode,
    maxTokens, setMaxTokens,
    contextTokens, setContextTokens,
    activeProvider, setActiveProvider,
    cloudApi, setCloudApi,
    customModelId, setCustomModelId,
    openAiKey, setOpenAiKey,
    anthropicKey, setAnthropicKey,
    googleKey, setGoogleKey,
    groqKey, setGroqKey,
    modelPath, setModelPath,
    tokenizerPath, setTokenizerPath,
  };
}
