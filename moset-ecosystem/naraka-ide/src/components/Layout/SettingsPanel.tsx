import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../../styles/components/SettingsPanel.css";

export function SettingsPanel({ onUpdate, onClose }: { onUpdate: () => void; onClose: () => void }) {
  const [modelPath, setModelPath] = useState(() => localStorage.getItem("moset_model_path") || "");
  const [glassEnabled, setGlassEnabled] = useState(() => localStorage.getItem("moset_glass_enabled") !== "false");
  const defaultPrePrompt = `Eres Naraka, la Inteligencia Soberana integrada en Moset IDE. Eres un arquitecto experto y tu proceso cognitivo debe estar ESTRICTAMENTE encapsulado.
Usa SIEMPRE la etiqueta <thought> para estructurar tu razonamiento, planear y analizar archivos antes de responder.
Tu respuesta final al usuario (fuera de <thought>) debe ser extremadamente directa, concisa, sin ruido y enfocada únicamente en el código, los resultados o la acción solicitada. Sé ultra eficiente con los tokens.`;

  const [prePrompt, setPrePrompt] = useState(() => {
    const saved = localStorage.getItem("moset_pre_prompt");
    // Hard refresh si tenían guardado el identity de Antigravity viejo
    if (saved && saved.includes("Antigravity")) {
      return defaultPrePrompt;
    }
    return saved !== null && saved !== "" ? saved : defaultPrePrompt;
  });

  // IA Providers config
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem("moset_ai_provider") || "soberano");
  const [cloudProvider, setCloudProvider] = useState(() => localStorage.getItem("moset_cloud_provider") || "openai");
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem("moset_google_api_key") || "");
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => localStorage.getItem("moset_anthropic_api_key") || "");
  const [openaiApiKey, setOpenaiApiKey] = useState(() => localStorage.getItem("moset_openai_api_key") || "");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(() => localStorage.getItem("moset_openai_base_url") || "");
  const [customModelId, setCustomModelId] = useState(() => localStorage.getItem("moset_custom_model_id") || "");
  const [mistralApiKey, setMistralApiKey] = useState(() => localStorage.getItem("moset_mistral_api_key") || "");
  const [localMaxTokens, setLocalMaxTokens] = useState(() => localStorage.getItem("moset_local_max_tokens") || "2048");
  const [cloudMaxTokens, setCloudMaxTokens] = useState(() => localStorage.getItem("moset_cloud_max_tokens") || "4096");

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
  const [qPensarEnabled, setQPensarEnabled] = useState(() => localStorage.getItem("moset_q_pensar") === "true" || localStorage.getItem("moset_q_pensar") === null);

  // Controles de Limpieza
  const [cudaCacheAutoClean, setCudaCacheAutoClean] = useState(() => localStorage.getItem("moset_cuda_autoclean") === "true");

  // Pestañas de configuración
  const [activeTab, setActiveTab] = useState<string>("ide");

  const save = () => {
    localStorage.setItem("moset_model_path", modelPath);
    localStorage.setItem("moset_glass_enabled", glassEnabled ? "true" : "false");
    localStorage.setItem("moset_pre_prompt", prePrompt);
    document.documentElement.style.setProperty('--glass', glassEnabled ? "blur(20px) saturate(180%)" : "none");

    localStorage.setItem("moset_ai_provider", aiProvider);
    localStorage.setItem("moset_cloud_provider", cloudProvider);
    localStorage.setItem("moset_google_api_key", googleApiKey);
    localStorage.setItem("moset_anthropic_api_key", anthropicApiKey);
    localStorage.setItem("moset_openai_api_key", openaiApiKey);
    localStorage.setItem("moset_openai_base_url", openaiBaseUrl);
    localStorage.setItem("moset_custom_model_id", customModelId);
    localStorage.setItem("moset_mistral_api_key", mistralApiKey);
    localStorage.setItem("moset_local_max_tokens", localMaxTokens);
    localStorage.setItem("moset_cloud_max_tokens", cloudMaxTokens);

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
    
    // Fix: Connect the orphaned rust endpoint
    invoke("set_clean_cuda_on_exit", { enabled: cudaCacheAutoClean }).catch((e: any) => console.error("Error enviando estado CUDA:", e));

    // Trigger update dispatch correctly
    window.dispatchEvent(new Event("settings-updated"));
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

  const menuItems = [
    { id: "ide", label: "General & Modelos", icon: "⚙️" },
    { id: "ai_providers", label: "Inteligencia Artificial", icon: "🧠" },
    { id: "orquestador", label: "Orquestador", icon: "🔗" },
    { id: "vigilante", label: "Vigilante (Seguridad)", icon: "🛡️" },
    { id: "quantum", label: "Computación GPU & Quantum", icon: "⚛️" }
  ];




  return (
    <div className="settings-overlay anim-fade-in" onClick={() => { save(); onClose(); }}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Parámetros y Preferencias</h2>
          <button className="settings-close-btn" onClick={() => { save(); onClose(); }}>✕</button>
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

                <div className="settings-card">
                  <label className="settings-checkbox-container">
                    <input type="checkbox" checked={glassEnabled} onChange={e => setGlassEnabled(e.target.checked)} className="settings-checkbox" />
                    <span>Activar Efectos Glassmorphism (Transparencia e Iluminación Premium)</span>
                  </label>
                  <div className="form-hint" style={{ marginLeft: "25px" }}>
                    Desactívalo en PCs con bajos recursos y sin GPU dedicada. Mejora el rendimiento en reposo.
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

            {activeTab === "ai_providers" && (
              <div className="anim-fade-in">
                <h3 className="settings-section-title">Proveedores de Inteligencia y APIs</h3>
                <div className="form-group">
                  <label className="settings-label">Proveedor de Inteligencia Principal</label>
                  <select 
                    value={aiProvider} 
                    onChange={e => setAiProvider(e.target.value)} 
                    className="settings-input" 
                  >
                    <option value="soberano">Motor Soberano (Local GGUF - Offline Segura)</option>
                    <option value="nube">Nube Estricta (APIs Externas solas)</option>
                    <option value="mixto">Mixto (Combina Nube y Local para delegar tareas)</option>
                  </select>
                </div>

                {(aiProvider === "nube" || aiProvider === "mixto") && (
                  <div className="form-group">
                    <label className="settings-label">Servicios en la Nube y Agentes</label>
                    <select 
                      value={cloudProvider} 
                      onChange={e => setCloudProvider(e.target.value)} 
                      className="settings-input" 
                    >
                      <option value="openai">Ecosistema OpenAI (GPT / API Compatible / LM Studio / OpenRouter)</option>
                      <option value="google">Ecosistema Google (Gemini, Vertex)</option>
                      <option value="anthropic">Ecosistema Anthropic (Claube 3.5)</option>
                      <option value="mistral">Ecosistema Mistral (Mistral AI)</option>
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="settings-label">ID de Modelo Personalizado (Ej: claude-3-5-sonnet-20241022, gemini-1.5-pro, gpt-4o)</label>
                  <input type="text" value={customModelId} onChange={e => setCustomModelId(e.target.value)} placeholder="Dejar en blanco para usar el model predeterminado" className="settings-input" />
                </div>

                <div className="settings-card">
                  <h4 style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-1)" }}>Autenticación para API {cloudProvider.toUpperCase()}</h4>
                  {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "google" && (
                    <div className="form-group">
                      <label className="settings-label">Google API Key</label>
                      <input type="password" value={googleApiKey} onChange={e => setGoogleApiKey(e.target.value)} placeholder="AIzaSy..." className="settings-input" />
                    </div>
                  )}

                  {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "anthropic" && (
                    <div className="form-group">
                      <label className="settings-label">Anthropic API Key</label>
                      <input type="password" value={anthropicApiKey} onChange={e => setAnthropicApiKey(e.target.value)} placeholder="sk-ant-api03-..." className="settings-input" />
                    </div>
                  )}

                  {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "mistral" && (
                    <div className="form-group">
                      <label className="settings-label">Mistral API Key</label>
                      <input type="password" value={mistralApiKey} onChange={e => setMistralApiKey(e.target.value)} placeholder="EjLW2eQ0..." className="settings-input" />
                    </div>
                  )}

                  {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "openai" && (
                    <>
                      <div className="form-group" style={{ marginBottom: "16px" }}>
                        <label className="settings-label">OpenAI API Key (O tu token para APIs Compatibles)</label>
                        <input type="password" value={openaiApiKey} onChange={e => setOpenaiApiKey(e.target.value)} placeholder="sk-..." className="settings-input" />
                      </div>
                      <div className="form-group">
                        <label className="settings-label">Base URL Endpoint (Ideal para usar con Ollama remoto o LM Studio)</label>
                        <input type="text" value={openaiBaseUrl} onChange={e => setOpenaiBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className="settings-input" />
                      </div>
                    </>
                  )}
                </div>

                <div className="settings-card">
                  <h4 style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-1)" }}>Límites de Tokens Máximos</h4>
                  
                  {(aiProvider === "soberano" || aiProvider === "mixto") && (
                    <div className="form-group" style={{ marginBottom: aiProvider === "mixto" ? "16px" : "0" }}>
                      <label className="settings-label">Modelo Local (Soberano): {localMaxTokens} tokens</label>
                      <input type="range" min="512" max="8192" step="512" value={localMaxTokens} onChange={e => setLocalMaxTokens(e.target.value)} style={{ width: '100%' }} />
                    </div>
                  )}

                  {(aiProvider === "nube" || aiProvider === "mixto") && (
                    <div className="form-group">
                      <label className="settings-label">Modelo en la Nube (API): {cloudMaxTokens} tokens</label>
                      <input type="range" min="1024" max="128000" step="1024" value={cloudMaxTokens} onChange={e => setCloudMaxTokens(e.target.value)} style={{ width: '100%' }} />
                    </div>
                  )}
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
