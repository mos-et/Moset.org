import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../../styles/components/SettingsPanel.css";

export function SettingsPanel({ onUpdate, onClose }: { onUpdate: () => void; onClose: () => void }) {
  const [modelPath, setModelPath] = useState(() => localStorage.getItem("moset_model_path") || "");
  const [tokenizerPath, setTokenizerPath] = useState(() => localStorage.getItem("moset_tokenizer_path") || "");
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
  const [activeTab, setActiveTab] = useState<string>("ide");

  const save = () => {
    localStorage.setItem("moset_model_path", modelPath);
    localStorage.setItem("moset_tokenizer_path", tokenizerPath);
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
    localStorage.setItem("moset_max_tokens", maxTokens);
    localStorage.setItem("moset_context_tokens", contextTokens);

    // D4f: Sincronizan los ajustes del Vigilante con el backend Rust
    invoke("configurar_vigilante", {
      prohibidos: vigProhibidos,
      peligrosos: vigPeligrosos,
      cautelosos: vigCautelosos,
      sandboxPaths: vigSandboxPaths,
    }).catch((e: any) => console.error("Error sincronizando Vigilante:", e));

    // Fix: Connect the orphaned rust endpoint
    invoke("set_clean_cuda_on_exit", { enabled: cudaCacheAutoClean }).catch((e: any) => console.error("Error enviando estado CUDA:", e));

    // Trigger update dispatch correctly
    window.dispatchEvent(new Event("moset-settings-updated"));
    
    // Auto-load model if path is provided
    if (modelPath && tokenizerPath) {
      invoke("cargar_modelo", { modeloPath: modelPath, tokenizerPath: tokenizerPath }).catch(e => console.error("Error cargando modelo:", e));
    }
    
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
        if (level === 'moderado') setVigSandboxPaths('S:/Naraka Studio');
        if (level === 'suave') setVigSandboxPaths('S:/Naraka Studio/Moset');
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
    { id: "ide", label: "General & Modelos", icon: "⚙️" },
    { id: "orquestador", label: "Orquestador", icon: "🔗" },
    { id: "vigilante", label: "Vigilante (Seguridad)", icon: "🛡️" },
    { id: "quantum", label: "Computación GPU & Quantum", icon: "⚛️" }
  ];




  return (
    <div className="settings-overlay anim-fade-in" onClick={() => { save(); onClose(); }}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Parámetros y Preferencias</h2>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button className="btn-primary" onClick={() => { save(); onClose(); }} style={{ padding: "4px 12px", fontSize: "12px", height: "28px" }}>
              Guardar y Cerrar
            </button>
            <button className="settings-close-btn" onClick={() => { save(); onClose(); }}>✕</button>
          </div>
        </div>

        {/* ── Tabs Layout ─────────────────────────────────── */}
        <div className="settings-layout">
          {/* Sidebar Tabs */}
          <div className="settings-sidebar">
            {menuItems.map(item => (
              <div 
                key={item.id} 
                onClick={() => setActiveTab(item.id)}
                className={`settings-tab ${activeTab === item.id ? 'active' : ''}`}
              >
                <span>{item.icon}</span> {item.label}
              </div>
            ))}
            
            <div className="settings-sidebar-footer">
              <button 
                className="btn-primary"
                onClick={() => { save(); onClose(); }}
              >
                Guardar Cambios
              </button>
              <button 
                className="btn-secondary"
                onClick={() => { import('@tauri-apps/plugin-opener').then(m => m.openUrl("https://moset.org")).catch(e => console.error(e)); }}
              >
                Visitar moset.org ↗
              </button>
            </div>
          </div>
          
          {/* Content Area */}
          <div className="settings-content-area">
            {activeTab === "ide" && (
              <div className="anim-fade-in">
                <h3 className="settings-section-title">Ajustes del IDE y Modelo Base</h3>
                
                <div className="form-group">
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

                <div className="settings-card">
                  <label className="settings-checkbox-container">
                    <input type="checkbox" checked={glassEnabled} onChange={e => setGlassEnabled(e.target.checked)} className="settings-checkbox" />
                    <span>Activar Efectos Glassmorphism (Transparencia e Iluminación Premium)</span>
                  </label>
                  <div className="form-hint" style={{ marginLeft: "25px" }}>
                    Desactívalo en PCs con bajos recursos y sin GPU dedicada. Mejora el rendimiento en reposo.
                  </div>
                </div>

                <div className="settings-section-divider"></div>
                <h4 style={{ color: "var(--accent-primary)", marginBottom: "12px", marginTop: "24px" }}>Memoria y Contexto (Límites)</h4>

                <div className="form-group" style={{ display: "flex", gap: "20px" }}>
                  <div style={{ flex: 1 }}>
                    <label className="settings-label">Límite de Contexto (Context Tokens)</label>
                    <input type="number" value={contextTokens} onChange={e => setContextTokens(e.target.value)} className="settings-input" />
                    <span className="form-hint">
                      ℹ️ Tamaño máximo del historial + archivos antes de usar /compact. Mayor tamaño = mayor uso de VRAM/RAM y más tiempo de procesamiento. (Recomendado: 4096 - 8192)
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="settings-label">Máximo de Respuesta (Max Tokens)</label>
                    <input type="number" value={maxTokens} onChange={e => setMaxTokens(e.target.value)} className="settings-input" />
                    <span className="form-hint">
                      ℹ️ Límite de tokens que la IA puede generar por respuesta. (Recomendado: 2048 - 4096)
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="settings-label">GitHub Classic Token (Para Autosync de Repositorios)</label>
                  <input type="password" value={githubApiKey} onChange={e => setGithubApiKey(e.target.value)} placeholder="ghp_..." className="settings-input" />
                  <span className="form-hint">
                    ℹ️ Utilizado por el motor Naraka para realizar push/pull automático y sincronizar el estado del proyecto.
                  </span>
                </div>

                <div className="form-group">
                  <label className="settings-label">Pre-Prompt (Directiva de Sistema AI)</label>
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
        </div>
      </div>
    </div>
  );
}
