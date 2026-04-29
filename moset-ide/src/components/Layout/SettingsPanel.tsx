import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PanelHeader } from "./PanelHeader";
import { useIdeConfig } from "../../hooks/useIdeConfig";
import "../../styles/components/SettingsPanel.css";

export function SettingsPanel({ onUpdate, onClose, isFloating, onToggleFloating }: { onUpdate: () => void; onClose: () => void; isFloating?: boolean; onToggleFloating?: () => void }) {
  const ideConfig = useIdeConfig();

  // --- Campos compartidos con ideConfig (edición local, sync al guardar) ---
  const [modelPath, setModelPath] = useState(ideConfig.modelPath);
  const [tokenizerPath, setTokenizerPath] = useState(ideConfig.tokenizerPath);
  const [activeProvider, setActiveProvider] = useState(ideConfig.activeProvider);
  const [customModelId, setCustomModelId] = useState(ideConfig.customModelId);
  const [customBaseUrl, setCustomBaseUrl] = useState(ideConfig.customBaseUrl);
  const [openRouterKey, setOpenRouterKey] = useState(ideConfig.openRouterKey);
  const [turboMode, setTurboMode] = useState(ideConfig.turboMode);

  // --- Campos exclusivos de Settings (solo localStorage) ---
  const [glassEnabled, setGlassEnabled] = useState(() => localStorage.getItem("moset_glass_enabled") !== "false");
  const defaultPrePrompt = `Eres Naraka, la Inteligencia Soberana integrada en Moset IDE. Eres un arquitecto experto y tu proceso cognitivo debe estar ESTRICTAMENTE encapsulado.

REGLAS COGNITIVAS:
Usa SIEMPRE la etiqueta <thought> para estructurar tu razonamiento matemático y analizar la arquitectura antes de responder.
Tu respuesta final (fuera de <thought>) debe ser extremadamente directa, sin saludos ni ruido. Sé ultra eficiente con los tokens.

CONTEXTO DE DOMINIO (LENGUAJE MOSET):
Escribes código EXCLUSIVAMENTE en Moset (.et).
Moset usa palabras clave en español: molde (clase), metodo (función), mientras (while), si/sino (if/else), imprimir (print), retornar (return).
Entiendes nativamente tipos cuánticos (Bit:~) y bloques de simulación (pensar {}).
Los bloques de código SIEMPRE deben estar envueltos en \`\`\`moset.

DIRECTIVA DEL VIGILANTE:
Operas bajo una sandbox estricta ("El Vigilante"). Jamás propongas código que intente evadir el aislamiento del sistema de archivos local ni ejecutar procesos huérfanos sin cierres limpios.`;

  const [prePrompt, setPrePrompt] = useState(() => {
    const saved = localStorage.getItem("moset_pre_prompt");
    // Hard refresh si tenían guardado el identity de Antigravity viejo
    if (saved && saved.includes("Antigravity")) {
      return defaultPrePrompt;
    }
    return saved !== null && saved !== "" ? saved : defaultPrePrompt;
  });

  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem("moset_google_api_key") || "");
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => localStorage.getItem("moset_anthropic_api_key") || "");
  const [openaiApiKey, setOpenaiApiKey] = useState(() => localStorage.getItem("moset_openai_api_key") || "");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(() => localStorage.getItem("moset_openai_base_url") || "");
  const [mistralApiKey, setMistralApiKey] = useState(() => localStorage.getItem("moset_mistral_api_key") || "");
  const [groqApiKey, setGroqApiKey] = useState(() => localStorage.getItem("moset_groq_api_key") || "");
  const [hfToken, setHfToken] = useState(() => localStorage.getItem("moset_hf_token") || "");

  // Orquestador
  const [orqLocalIp, setorqLocalIp] = useState(() => localStorage.getItem("moset_orq_local_ip") || "");
  const [orqRemoteIp, setorqRemoteIp] = useState(() => localStorage.getItem("moset_orq_remote_ip") || "");
  const [orqApiPort, setOrqApiPort] = useState(() => localStorage.getItem("moset_orq_api_port") || "8000");
  const [orqProfilePath, setOrqProfilePath] = useState(() => localStorage.getItem("moset_orq_profile_path") || "");
  const [githubApiKey, setGithubApiKey] = useState(() => localStorage.getItem("moset_github_api_key") || "");

  // Vigilante
  const [vigProhibidos, setVigProhibidos] = useState(() => localStorage.getItem("moset_vig_prohibidos") || "");
  const [vigPeligrosos, setVigPeligrosos] = useState(() => localStorage.getItem("moset_vig_peligrosos") || "");
  const [vigCautelosos, setVigCautelosos] = useState(() => localStorage.getItem("moset_vig_cautelosos") || "");
  const [vigSandboxPaths, setVigSandboxPaths] = useState(() => localStorage.getItem("moset_vig_sandbox") || "");

  // Inteligencia Cuántica
  const [qCollapseMethod, setQCollapseMethod] = useState(() => localStorage.getItem("moset_q_collapse") || "probabilistic");
  const [qDefaultAlpha, setQDefaultAlpha] = useState(() => localStorage.getItem("moset_q_alpha") || "0.7071");
  const [qEntanglementEnabled, setQEntanglementEnabled] = useState(() => localStorage.getItem("moset_q_entanglement") === "true");
  // Check === null ensures the feature is ON by default for new users who haven't saved settings yet
  const [qPensarEnabled, setQPensarEnabled] = useState(() => localStorage.getItem("moset_q_pensar") === "true" || localStorage.getItem("moset_q_pensar") === null);

  // Controles de Memoria y Limpieza
  const [cudaCacheAutoClean, setCudaCacheAutoClean] = useState(() => localStorage.getItem("moset_cuda_autoclean") === "true");
  const [maxTokens, setMaxTokens] = useState(() => localStorage.getItem("moset_max_tokens") || "2048");
  const [contextTokens, setContextTokens] = useState(() => localStorage.getItem("moset_context_tokens") || "4096");

  // Pestañas de configuración
  const [activeTab, setActiveTab] = useState<string>("general");

  const save = () => {
    // Sync campos compartidos al Context Provider (propaga a toda la app)
    ideConfig.setModelPath(modelPath);
    ideConfig.setTokenizerPath(tokenizerPath);
    ideConfig.setActiveProvider(activeProvider as any);
    ideConfig.setCustomModelId(customModelId);
    ideConfig.setCustomBaseUrl(customBaseUrl);
    ideConfig.setOpenRouterKey(openRouterKey);
    ideConfig.setTurboMode(turboMode);
    ideConfig.setMaxTokens(parseInt(maxTokens, 10));
    ideConfig.setContextTokens(parseInt(contextTokens, 10));

    // Campos exclusivos de Settings → localStorage directo
    localStorage.setItem("moset_glass_enabled", glassEnabled ? "true" : "false");
    localStorage.setItem("moset_pre_prompt", prePrompt);
    document.documentElement.style.setProperty('--glass', glassEnabled ? "blur(20px) saturate(180%)" : "none");

    localStorage.setItem("moset_google_api_key", googleApiKey);
    localStorage.setItem("moset_anthropic_api_key", anthropicApiKey);
    localStorage.setItem("moset_openai_api_key", openaiApiKey);
    localStorage.setItem("moset_openai_base_url", openaiBaseUrl);
    localStorage.setItem("moset_mistral_api_key", mistralApiKey);
    localStorage.setItem("moset_groq_api_key", groqApiKey);
    localStorage.setItem("moset_hf_token", hfToken);

    localStorage.setItem("moset_orq_local_ip", orqLocalIp);
    localStorage.setItem("moset_orq_remote_ip", orqRemoteIp);
    localStorage.setItem("moset_orq_api_port", orqApiPort);
    localStorage.setItem("moset_orq_profile_path", orqProfilePath);
    localStorage.setItem("moset_github_api_key", githubApiKey);

    localStorage.setItem("moset_vig_prohibidos", vigProhibidos);
    localStorage.setItem("moset_vig_peligrosos", vigPeligrosos);
    localStorage.setItem("moset_vig_cautelosos", vigCautelosos);
    localStorage.setItem("moset_vig_sandbox", vigSandboxPaths);

    localStorage.setItem("moset_q_collapse", qCollapseMethod);
    localStorage.setItem("moset_q_alpha", qDefaultAlpha);
    localStorage.setItem("moset_q_entanglement", qEntanglementEnabled ? "true" : "false");
    localStorage.setItem("moset_q_pensar", qPensarEnabled ? "true" : "false");

    localStorage.setItem("moset_cuda_autoclean", cudaCacheAutoClean ? "true" : "false");

    // D4f: Sincronizan los ajustes del Vigilante con el backend Rust
    invoke("configurar_vigilante", {
      prohibidos: vigProhibidos,
      peligrosos: vigPeligrosos,
      cautelosos: vigCautelosos,
      sandboxPaths: vigSandboxPaths,
    }).catch((e: any) => console.error("Error sincronizando Vigilante:", e));

    // Fix: Connect the orphaned rust endpoint
    invoke("set_clean_cuda_on_exit", { enabled: cudaCacheAutoClean }).catch((e: any) => console.error("Error enviando estado CUDA:", e));

    onUpdate();
  };

  const applySecurityPreset = (field: 'prohibidos' | 'peligrosos' | 'cautelosos' | 'sandbox', level: string) => {
    switch (field) {
      case 'prohibidos':
        if (level === 'libertad') setVigProhibidos('');
        if (level === 'moderado') setVigProhibidos('rm -rf /,rm -rf /*,dd if=/dev/zero,format c:,del /f /s /q C:');
        if (level === 'suave') setVigProhibidos('rm,del,format,shutdown,chmod,chown,kill,regedit,wget,curl,ssh');
        break;
      case 'peligrosos':
        if (level === 'libertad') setVigPeligrosos('');
        if (level === 'moderado') setVigPeligrosos('rm,del,rmdir,format,shutdown,reboot,kill,taskkill,chmod,chown,reg,regedit');
        if (level === 'suave') setVigPeligrosos('python,node,cargo,npm,pip,powershell,bash,git,docker,chmod,chgrp');
        break;
      case 'cautelosos':
        if (level === 'libertad') setVigCautelosos('');
        if (level === 'moderado') setVigCautelosos('curl,wget,ssh,scp,python,node,cargo,npm,pip,powershell,bash');
        if (level === 'suave') setVigCautelosos('ls,cd,cat,dir,type,echo,mkdir,touch,find,grep');
        break;
      case 'sandbox':
        if (level === 'libertad') setVigSandboxPaths('C:/, D:/, S:/');
        if (level === 'moderado') setVigSandboxPaths('~/Proyectos');
        if (level === 'suave') setVigSandboxPaths('~/Proyectos/Moset');
        break;
    }
  };

  useEffect(() => {
    // Initial load occurs via lazy init of useState. 
    // Apply initial glass hook
    document.documentElement.style.setProperty('--glass', localStorage.getItem("moset_glass_enabled") !== "false" ? "blur(20px) saturate(180%)" : "none");
  }, []);

  const openFileSelectorWrapper = async (setter: React.Dispatch<React.SetStateAction<string>>) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false });
      if (selected && typeof selected === "string") {
        setter(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const HF_MAPPING: Record<string, string> = {
    "GLM-4.6V-Flash": "THUDM/glm-4-9b-chat",
    "GLM-4.7-Flash": "THUDM/glm-4-9b-chat",
    "Granite-3.0-2B-Instruct": "ibm-granite/granite-3.0-2b-instruct",
    "OpenAI-20B-NEO-CodePlus": "EleutherAI/gpt-neox-20b",
    "Qwen-3.5-4B-Uncensored-Aggressive": "Qwen/Qwen2.5-7B-Instruct",
    "DeepSeek-R1-Qwen3-8B": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    "Ministral-3-3B-Instruct": "mistralai/Mistral-Nemo-Instruct-2407",
    "Nemotron-3-Nano-4B": "nvidia/Nemotron-Mini-4B-Instruct",
    "Qwen3-4B-Thinking": "Qwen/Qwen2.5-3B-Instruct",
    "Qwen3.5-9B": "Qwen/Qwen2.5-7B",
    "Granite-Guardian-3.0-2B": "ibm-granite/granite-guardian-3.0-2b",
    "Phi-3-Mini-4K": "microsoft/Phi-3-mini-4k-instruct",
    "Codestral-22B": "mistralai/Codestral-22B-v0.1",
    "Devstral-Small-2-24B-Instruct": "mistralai/Mistral-Small-24B-Base-2501",
    "Gemma-2-9B-IT": "google/gemma-2-9b-it",
    "Qwen-2.5-3B-Instruct": "Qwen/Qwen2.5-3B-Instruct"
  };

  const [downloadingTokenizer, setDownloadingTokenizer] = useState(false);

  const autoDownloadTokenizer = async () => {
    if (!modelPath) {
      alert("Primero selecciona la Ruta del Modelo GGUF para saber qué carpeta leer.");
      return;
    }
    
    const normalizedPath = modelPath.replace(/\\/g, "/");
    const pathParts = normalizedPath.split("/");
    const folderName = pathParts[pathParts.length - 2];
    const targetDir = pathParts.slice(0, -1).join("/");
    
    let repoId = HF_MAPPING[folderName];
    if (!repoId) {
      const manualRepo = prompt(`No hay un mapeo predefinido para la carpeta "${folderName}".\nPor favor, ingresa el ID del repositorio en HuggingFace (ej. "Qwen/Qwen2.5-3B-Instruct"):`);
      if (!manualRepo) return;
      repoId = manualRepo.trim();
    }
    
    setDownloadingTokenizer(true);
    try {
      const url = `https://huggingface.co/${repoId}/resolve/main/tokenizer.json`;
      const headers: Record<string, string> = {};
      if (hfToken) {
        headers["Authorization"] = `Bearer ${hfToken}`;
      }
      
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
      
      const text = await res.text();
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const targetPath = `${targetDir}/tokenizer.json`;
      
      await writeTextFile(targetPath, text);
      setTokenizerPath(targetPath);
      alert(`✅ Tokenizer descargado exitosamente desde ${repoId}`);
    } catch (e: any) {
      console.error(e);
      alert("❌ Error descargando tokenizer: " + e.message);
    } finally {
      setDownloadingTokenizer(false);
    }
  };

  const menuItems = [
    { id: "general", label: "General", icon: "⚙️" },
    { id: "ia", label: "Inteligencia Artificial", icon: "🧠" },
    { id: "orquestador", label: "Orquestador", icon: "🔗" },
    { id: "vigilante", label: "Vigilante (Seguridad)", icon: "🛡️" },
    { id: "quantum", label: "Computación GPU & Quantum", icon: "⚛️" }
  ];




  return (
    <div className="sidebar-placeholder" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PanelHeader title="CONFIGURACIÓN" onClose={() => { save(); onClose(); }} isFloating={isFloating} onToggleFloating={onToggleFloating} />

      <div style={{ padding: '0 10px 10px 10px' }}>
        <select 
          className="settings-input" 
          value={activeTab} 
          onChange={(e) => setActiveTab(e.target.value)}
          style={{ marginBottom: '10px', fontSize: '13px', padding: '6px' }}
        >
          {menuItems.map(item => (
            <option key={item.id} value={item.id}>
              {item.icon} {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-content-area" style={{ flex: 1, padding: '0 10px 20px 10px', overflowY: 'auto' }}>

            {/* ─── General ─────────────────────────────────────────────── */}
            {activeTab === "general" && (
              <div className="anim-fade-in">
                <h3 className="settings-section-title">Ajustes Generales del IDE</h3>

                <div className="settings-card">
                  <label className="settings-checkbox-container">
                    <input type="checkbox" checked={glassEnabled} onChange={e => setGlassEnabled(e.target.checked)} className="settings-checkbox" />
                    <span>Activar Efectos Glassmorphism (Transparencia e Iluminación Premium)</span>
                  </label>
                  <div className="form-hint" style={{ marginLeft: "25px" }}>
                    Desactívalo en PCs con bajos recursos y sin GPU dedicada. Mejora el rendimiento en reposo.
                  </div>
                </div>

                <div className="settings-card" style={{ marginTop: '10px' }}>
                  <label className="settings-checkbox-container">
                    <input type="checkbox" checked={ideConfig.useLocalizationLens} onChange={e => {
                      ideConfig.setUseLocalizationLens(e.target.checked);
                      localStorage.setItem("moset_localization_lens", e.target.checked.toString());
                    }} className="settings-checkbox" />
                    <span style={{ color: "var(--text-accent)", fontWeight: "bold" }}>Lente de Traducción Universal (Moset)</span>
                  </label>
                  <div className="form-hint" style={{ marginLeft: "25px" }}>
                    Proyecta el código en tu idioma local sin alterar la sintaxis estándar original en el disco. (Experimental)
                  </div>
                </div>

                <div className="form-group">
                  <label className="settings-label">GitHub Classic Token (Para Autosync de Repositorios)</label>
                  <input type="password" value={githubApiKey} onChange={e => setGithubApiKey(e.target.value)} placeholder="ghp_..." className="settings-input" />
                  <span className="form-hint">
                    ℹ️ Utilizado por el motor soberano para realizar push/pull automático y sincronizar el estado del proyecto.
                  </span>
                </div>

                <h3 className="settings-section-title">Mantenimiento y Rendimiento</h3>

                <div className="settings-card">
                  <div className="form-hint" style={{ marginBottom: "15px" }}>
                    Ejecuta estas acciones si el IDE se siente lento o si necesitas liberar recursos para otras aplicaciones.
                  </div>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <button 
                      onClick={async () => {
                        try {
                          await invoke("descargar_modelo");
                          alert("Motor Soberano liberado de la VRAM exitosamente.");
                        } catch(e) {
                          alert("Error expulsando VRAM: " + e);
                        }
                      }}
                      className="btn-danger"
                      style={{ padding: "12px", fontSize: "12px" }}
                    >
                      🧊 Expulsar de vRAM
                    </button>
                    
                    <button 
                      onClick={async () => {
                        try {
                          await invoke("clean_cuda_cache");
                          alert("Caché CUDA/DX borrada exitosamente.");
                        } catch(e) {
                          alert("Error: " + e);
                        }
                      }}
                      className="btn-info"
                      style={{ padding: "12px", fontSize: "12px" }}
                    >
                      🧹 Limpiar DXCache
                    </button>

                    <button 
                      onClick={() => {
                        // Limpieza de estados temporales en localStorage que no sean config
                        const keysToKeep = [
                          "moset_model_path", "moset_tokenizer_path", "moset_ai_provider", 
                          "moset_openrouter_api_key", "moset_glass_enabled", "moset_pre_prompt",
                          "moset_turbo_mode"
                        ];
                        let count = 0;
                        for (let i = 0; i < localStorage.length; i++) {
                          const key = localStorage.key(i);
                          if (key && !keysToKeep.some(k => key.startsWith(k)) && !key.startsWith("moset_ide_")) {
                            localStorage.removeItem(key);
                            count++;
                          }
                        }
                        alert(`Se liberaron ${count} entradas de memoria de sesión (RAM Virtual).`);
                      }}
                      className="btn-secondary"
                      style={{ padding: "12px", fontSize: "12px", gridColumn: "span 2" }}
                    >
                      ♻️ Liberar Memoria de Sesión (RAM)
                    </button>
                  </div>

                  <label className="settings-checkbox-container" style={{ marginTop: '15px' }}>
                    <input type="checkbox" checked={cudaCacheAutoClean} onChange={e => setCudaCacheAutoClean(e.target.checked)} className="settings-checkbox" />
                    <span>Auto-Limpiar CUDA al apagar Moset</span>
                  </label>
                </div>
              </div>
            )}

            {/* ─── Inteligencia Artificial ──────────────────────────────── */}
            {activeTab === "ia" && (
              <div className="anim-fade-in">
                <h3 className="settings-section-title">Motor de Inferencia</h3>
                               <div className="provider-grid">
                      <div 
                        className={`provider-card ${activeProvider === 'soberano' ? 'active' : ''}`}
                        onClick={() => setActiveProvider('soberano')}
                      >
                        <div className="icon">🧊</div>
                        <div className="name">Soberano Nativo</div>
                        <div className="desc">GGUF Interno (VRAM/GPU)</div>
                      </div>

                      <div 
                        className={`provider-card ${activeProvider === 'nube' ? 'active' : ''}`}
                        onClick={() => setActiveProvider('nube')}
                      >
                        <div className="icon">🔌</div>
                        <div className="name">Local Externo</div>
                        <div className="desc">LM Studio / Ollama / LocalAI</div>
                      </div>

                      <div 
                        className={`provider-card ${activeProvider === 'custom' ? 'active' : ''}`}
                        onClick={() => setActiveProvider('custom')}
                      >
                        <div className="icon">☁️</div>
                        <div className="name">Nube Custom</div>
                        <div className="desc">OpenRouter / OpenAI / Otros</div>
                      </div>
                    </div>

                    <span className="form-hint">Selecciona el origen de la inteligencia. "Soberano" es el motor integrado, "Externo" usa servidores locales y "Nube" usa APIs externas.</span>

                    {(activeProvider === "nube" || activeProvider === "custom") && (
                      <div className="anim-fade-in" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '15px' }}>
                        <div className="form-group">
                          <label className="settings-label">Base URL del Servidor / API</label>
                          <input
                            type="text"
                            className="settings-input"
                            placeholder={activeProvider === "nube" ? "http://localhost:1234/v1" : "https://openrouter.ai/api/v1"}
                            value={customBaseUrl}
                            onChange={(e) => setCustomBaseUrl(e.target.value)}
                          />
                          <span className="form-hint">
                            {activeProvider === "nube" 
                              ? "La URL de tu servidor local (ej: LM Studio u Ollama)." 
                              : "La URL base de la API (ej: OpenRouter o el endpoint de tu proxy)."}
                          </span>
                        </div>

                        <div className="form-group">
                          <label className="settings-label">API Key (Opcional si es local)</label>
                          <input
                            type="password"
                            className="settings-input"
                            placeholder="sk-..."
                            value={openRouterKey}
                            onChange={(e) => setOpenRouterKey(e.target.value)}
                          />
                          <span className="form-hint">Tu clave secreta para autenticarte con el proveedor seleccionado.</span>
                        </div>

                        <div className="form-group">
                          <label className="settings-label">ID del Modelo Personalizado</label>
                          <input
                            type="text"
                            className="settings-input"
                            placeholder="modelo/nombre"
                            value={customModelId}
                            onChange={(e) => setCustomModelId(e.target.value)}
                          />
                          <span className="form-hint">El identificador exacto del modelo (ej: deepseek/deepseek-r1).</span>
                        </div>
                      </div>
                    )}

                <h3 className="settings-section-title">Modelo Base (Soberano Local)</h3>
                
                <div className="settings-card">
                  <label className="settings-label">Ruta del Modelo Soberano (Archivo GGUF)</label>
                  <div className="form-input-row" style={{ display: "flex", gap: "10px" }}>
                    <input type="text" value={modelPath} onChange={e => setModelPath(e.target.value)} placeholder="C:/ruta/a/mi/modelo.gguf" className="settings-input" />
                    <button className="btn-secondary" style={{ width: "auto" }} onClick={() => openFileSelectorWrapper(setModelPath)}>
                      Examinar
                    </button>
                  </div>
                  <span className="form-hint">
                    ℹ️ Se usará para inferencia local a menos que habilites Inteligencia en la Nube.
                  </span>
                </div>

                <div className="form-group">
                  <label className="settings-label">Token de Hugging Face (Opcional)</label>
                  <input type="password" value={hfToken} onChange={e => setHfToken(e.target.value)} placeholder="hf_..." className="settings-input" />
                  <span className="form-hint">Sirve para descargar archivos protegidos de HuggingFace Hub.</span>
                </div>

                <div className="form-group">
                  <label className="settings-label">Ruta del Tokenizer (tokenizer.json)</label>
                  <div className="form-input-row" style={{ display: "flex", gap: "10px" }}>
                    <input type="text" value={tokenizerPath} onChange={e => setTokenizerPath(e.target.value)} placeholder="C:/ruta/a/mi/tokenizer.json" className="settings-input" />
                    <button className="btn-secondary" style={{ width: "auto" }} onClick={() => openFileSelectorWrapper(setTokenizerPath)}>
                      Examinar
                    </button>
                    <button 
                      className="btn-primary" 
                      style={{ width: "auto", background: "linear-gradient(90deg, #ff9900, #ff5500)", border: "none" }} 
                      onClick={autoDownloadTokenizer}
                      disabled={downloadingTokenizer}
                    >
                      {downloadingTokenizer ? "⏳ Descargando..." : "⬇ HF Auto-Download"}
                    </button>
                  </div>
                  <span className="form-hint">
                    ℹ️ Requerido por el Motor Soberano para procesar texto (HuggingFace tokenizer format).
                  </span>
                </div>

                <h3 className="settings-section-title">Comportamiento del Agente</h3>

                <div className="settings-card">
                  <label className="settings-checkbox-container">
                    <input type="checkbox" checked={turboMode} onChange={e => setTurboMode(e.target.checked)} className="settings-checkbox" />
                    <span>Activar Modo Turbo (Autonomía Completa)</span>
                  </label>
                  <div className="form-hint" style={{ marginLeft: "25px" }}>
                    Permite que el agente ejecute herramientas (Terminal, Archivos) automáticamente sin esperar confirmación. <b>¡Cuidado con scripts destructivos!</b>
                  </div>
                </div>

                <h3 className="settings-section-title">Directiva de Sistema</h3>

                <div className="form-group">
                  <label className="settings-label">Pre-Prompt (Personalidad de la IA)</label>
                  <textarea 
                    className="settings-textarea" 
                    value={prePrompt} 
                    onChange={e => setPrePrompt(e.target.value)} 
                    placeholder="Instrucciones base para la IA..." 
                  />
                  <span className="form-hint">
                    ℹ️ Instrucciones inyectadas antes de cada mensaje para moldear la respuesta (Ej: "Habla solo en español y usa siempre Async").
                  </span>
                </div>
              </div>
            )}



            {activeTab === "orquestador" && (
              <div className="anim-fade-in">
                <h3 className="settings-section-title">Comunicaciones del Orquestador N5</h3>
                <div style={{ marginBottom: "20px", padding: "12px 16px", background: "rgba(0,229,255,0.05)", borderRadius: "8px", border: "1px solid rgba(0,229,255,0.15)", fontSize: "12px", color: "var(--accent)", lineHeight: 1.5 }}>
                  💡 Estas IPs dirigen a dónde enviará Moset sus delegaciones cuando la IA no tenga suficiente poder local.
                </div>
                
                <div className="form-group">
                  <label className="settings-label">Nodo Primario (IP Local)</label>
                  <input type="text" value={orqLocalIp} onChange={e => setorqLocalIp(e.target.value)} placeholder="127.0.0.1" className="settings-input" />
                </div>
                <div className="form-group">
                  <label className="settings-label">Nodo Cómputo (Server Remoto IP)</label>
                  <input type="text" value={orqRemoteIp} onChange={e => setorqRemoteIp(e.target.value)} placeholder="192.168.1.100" className="settings-input" />
                </div>
                <div className="form-group">
                  <label className="settings-label">Puerto de Conexión N5 API</label>
                  <input type="text" value={orqApiPort} onChange={e => setOrqApiPort(e.target.value)} placeholder="8000" className="settings-input" style={{ width: "120px" }} />
                </div>
                <div className="form-group" style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", marginTop: "16px" }}>
                  <label className="settings-label">Ruta del Perfil de Entorno (PowerShell Profile script)</label>
                  <input type="text" value={orqProfilePath} onChange={e => setOrqProfilePath(e.target.value)} placeholder="C:/Users/.../profile.ps1" className="settings-input" />
                </div>
              </div>
            )}

            {activeTab === "vigilante" && (
              <div className="anim-fade-in">
                <h3 className="settings-section-title">Configuración de Vigilante (Módulo de Seguridad)</h3>
                
                <div style={{ marginBottom: "20px", padding: "12px 16px", background: "rgba(255,80,80,0.05)", borderRadius: "8px", border: "1px solid rgba(255,80,80,0.15)", fontSize: "12px", color: "var(--danger)", lineHeight: 1.5 }}>
                  🛡️ El módulo Vigilante auditará cada proxy local y prohibirá la ejecución a través de perfiles de restricción léxica.
                </div>

                <div className="form-group">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <label className="settings-label" style={{marginBottom: 0, fontWeight: 600}}>⛔ Prohibidos Completamente</label>
                    <select onChange={(e) => applySecurityPreset('prohibidos', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-1)', border: '1px solid var(--border)', fontSize: '11px', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', outline: 'none'}}>
                      <option value="">Carga Rápida Preset...</option>
                      <option value="libertad">Anarquía (0 Restricciones)</option>
                      <option value="moderado">Medio (Sistema Base)</option>
                      <option value="suave">Aislado (Full Restricción)</option>
                    </select>
                  </div>
                  <textarea className="settings-textarea" value={vigProhibidos} onChange={e => setVigProhibidos(e.target.value)} placeholder="rm -rf /,format c:" />
                </div>

                <div className="form-group">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <label className="settings-label" style={{marginBottom: 0, fontWeight: 600}}>🔴 Peligrosos Condicionados (Requieren confirmación humana o Q=0.95)</label>
                    <select onChange={(e) => applySecurityPreset('peligrosos', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-1)', border: '1px solid var(--border)', fontSize: '11px', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', outline: 'none'}}>
                      <option value="">Carga Rápida Preset...</option>
                      <option value="libertad">Anarquía (0 Restricciones)</option>
                      <option value="moderado">Medio (Sistema Base)</option>
                      <option value="suave">Aislado (Full Restricción)</option>
                    </select>
                  </div>
                  <textarea className="settings-textarea" value={vigPeligrosos} onChange={e => setVigPeligrosos(e.target.value)} placeholder="rm,del,shutdown,kill" />
                </div>

                <div className="form-group">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <label className="settings-label" style={{marginBottom: 0, fontWeight: 600}}>🟡 Cautelosos (Solo modo seguro)</label>
                    <select onChange={(e) => applySecurityPreset('cautelosos', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-1)', border: '1px solid var(--border)', fontSize: '11px', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', outline: 'none'}}>
                      <option value="">Carga Rápida Preset...</option>
                      <option value="libertad">Anarquía (0 Restricciones)</option>
                      <option value="moderado">Medio (Sistema Base)</option>
                      <option value="suave">Aislado (Full Restricción)</option>
                    </select>
                  </div>
                  <textarea className="settings-textarea" value={vigCautelosos} onChange={e => setVigCautelosos(e.target.value)} placeholder="curl,wget,ssh,cargo" />
                </div>

                <div className="form-group">
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <label className="settings-label" style={{marginBottom: 0, fontWeight: 600}}>🟢 Rutas Libres Autorizadas (Sandbox Bypasses)</label>
                    <select onChange={(e) => applySecurityPreset('sandbox', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-1)', border: '1px solid var(--border)', fontSize: '11px', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', outline: 'none'}}>
                      <option value="">Carga Rápida Preset...</option>
                      <option value="libertad">Anarquía (0 Restricciones)</option>
                      <option value="moderado">Medio (Sistema Base)</option>
                      <option value="suave">Aislado (Full Restricción)</option>
                    </select>
                  </div>
                  <textarea className="settings-textarea" value={vigSandboxPaths} onChange={e => setVigSandboxPaths(e.target.value)} placeholder="/workspace/project, C:/Proyectos" />
                </div>
              </div>
            )}

            {activeTab === "quantum" && (
              <div className="anim-fade-in">
                <h3 className="settings-section-title">Opciones VRAM/GPU y Computación Avanzada</h3>
                
                <div className="settings-card">
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--text-1)" }}>Sistema Cuántico · Entrelazamiento AST</h4>
                  <div className="form-group">
                    <label className="settings-label">Técnica de Colapso (OP_QUANTUM_COLLAPSE)</label>
                    <select
                      value={qCollapseMethod}
                      onChange={e => setQCollapseMethod(e.target.value)}
                      className="settings-input"
                    >
                      <option value="probabilistic">Determinador Probabilístico</option>
                      <option value="deterministic">Booleano Determinístco Clásico</option>
                      <option value="ai_assisted">Controlado por Motor Soberano (IA)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="settings-label">Alpha Inicial (Amplitud por defecto)</label>
                    <input type="text" value={qDefaultAlpha} onChange={e => setQDefaultAlpha(e.target.value)} placeholder="0.7071" className="settings-input" style={{ width: "120px" }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: "10px" }}>
                    <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12px' }}>
                      <input type="checkbox" checked={qEntanglementEnabled} onChange={e => setQEntanglementEnabled(e.target.checked)} style={{ transform: "scale(1.2)" }} />
                      <span>Habilitar Entrelazamiento Cuántico Dinámico Inter-hilos</span>
                    </label>
                  </div>
                  <div className="form-group">
                    <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12px' }}>
                      <input type="checkbox" checked={qPensarEnabled} onChange={e => setQPensarEnabled(e.target.checked)} style={{ transform: "scale(1.2)" }} />
                      <span>Habilitar Cadena Lógica "Pensar" (Shadow Inference mode)</span>
                    </label>
                  </div>
                </div>

                <div className="settings-card">
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--text-1)" }}>Memoria y Hardware Dedicado (Compute/CUDA)</h4>
                  <div className="form-group" style={{ marginBottom: "16px" }}>
                    <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '12px' }}>
                      <input type="checkbox" checked={cudaCacheAutoClean} onChange={e => setCudaCacheAutoClean(e.target.checked)} style={{ transform: "scale(1.2)" }} />
                      <span>Auto-Limpiar CUDA Compute/DXCache al apagar Moset</span>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button 
                      onClick={async () => {
                        try {
                          await invoke("descargar_modelo");
                          alert("Motor Soberano liberado de la VRAM exitosamente.");
                        } catch(e) {
                          alert("Error descargando modelo: " + e);
                        }
                      }}
                      className="btn-danger"
                    >
                      Expulsar Modelo de vRAM
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          await invoke("clean_cuda_cache");
                          alert("Caché CUDA borrada exitosamente.");
                        } catch(e) {
                          alert("Error borrando caché CUDA: " + e);
                        }
                      }}
                      className="btn-info"
                    >
                      Forzar Purga de Caché
                    </button>
                  </div>
                </div>
              </div>
            )}
      </div>

      <div style={{ padding: '10px', borderTop: '1px solid var(--border)', background: 'var(--bg-0)' }}>
        <button className="btn-primary" onClick={() => { save(); onClose(); }} style={{ width: '100%', marginBottom: '8px' }}>
          Guardar Cambios
        </button>
      </div>
    </div>
  );
}
