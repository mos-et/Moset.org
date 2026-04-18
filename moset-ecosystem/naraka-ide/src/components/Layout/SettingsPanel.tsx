import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function SettingsPanel({ onUpdate, onClose }: { onUpdate: () => void; onClose: () => void }) {
  const [modelPath, setModelPath] = useState(() => localStorage.getItem("moset_model_path") || "");
  const [glassEnabled, setGlassEnabled] = useState(() => localStorage.getItem("moset_glass_enabled") !== "false");
  const defaultPrePrompt = `Eres Antigravity (Soberano AI). Eres un ingeniero experto y tu proceso cognitivo debe estar ESTRICTAMENTE encapsulado.
Usa SIEMPRE la etiqueta <thought> para estructurar tu razonamiento, planear y analizar archivos antes de responder.
Tu respuesta final al usuario (fuera de <thought>) debe ser extremadamente directa, concisa, sin ruido y enfocada únicamente en el código, los resultados o la acción solicitada. Sé ultra eficiente con los tokens.`;

  const [prePrompt, setPrePrompt] = useState(() => {
    const saved = localStorage.getItem("moset_pre_prompt");
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

  // Orquestador
  const [orqLocalIp, setorqLocalIp] = useState(() => localStorage.getItem("moset_orq_local_ip") || "");
  const [orqRemoteIp, setorqRemoteIp] = useState(() => localStorage.getItem("moset_orq_remote_ip") || "");
  const [orqApiPort, setOrqApiPort] = useState(() => localStorage.getItem("moset_orq_api_port") || "8000");
  const [orqProfilePath, setOrqProfilePath] = useState(() => localStorage.getItem("moset_orq_profile_path") || "");

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

    localStorage.setItem("moset_orq_local_ip", orqLocalIp);
    localStorage.setItem("moset_orq_remote_ip", orqRemoteIp);
    localStorage.setItem("moset_orq_api_port", orqApiPort);
    localStorage.setItem("moset_orq_profile_path", orqProfilePath);

    localStorage.setItem("moset_vig_prohibidos", vigProhibidos);
    localStorage.setItem("moset_vig_peligrosos", vigPeligrosos);
    localStorage.setItem("moset_vig_cautelosos", vigCautelosos);
    localStorage.setItem("moset_vig_sandbox", vigSandboxPaths);

    localStorage.setItem("moset_q_collapse", qCollapseMethod);
    localStorage.setItem("moset_q_alpha", qDefaultAlpha);
    localStorage.setItem("moset_q_entanglement", qEntanglementEnabled ? "true" : "false");
    localStorage.setItem("moset_q_pensar", qPensarEnabled ? "true" : "false");

    localStorage.setItem("moset_cuda_autoclean", cudaCacheAutoClean ? "true" : "false");
    
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
    { id: "orquestador", label: "Orquestador N5", icon: "🔗" },
    { id: "vigilante", label: "Vigilante (Seguridad)", icon: "🛡️" },
    { id: "quantum", label: "Computación GPU & Quantum", icon: "⚛️" }
  ];

  const labelStyle: React.CSSProperties = { fontSize: "12px", color: "var(--text-3)", marginBottom: "6px", display: "block", fontWeight: 500 };
  const textareaStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "10px", fontSize: "12px",
    backgroundColor: "var(--bg-0)", border: "1px solid var(--border)",
    color: "var(--text-1)", borderRadius: "6px", resize: "vertical", minHeight: "70px",
    fontFamily: "monospace", transition: "border 0.2s"
  };

  return (
    <div className="settings-overlay anim-fade-in" onClick={() => { save(); onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div className="settings-modal" onClick={e => e.stopPropagation()} style={{
        background: "var(--bg-1)",
        border: "1px solid var(--border)", borderRadius: "14px",
        width: "780px", maxWidth: "90vw", height: "600px", maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        overflow: "hidden"
      }}>
        <div className="settings-header" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px", borderBottom: "1px solid var(--border)",
          background: "rgba(255,255,255,0.02)"
        }}>
          <h2 style={{ fontSize: "16px", margin: 0, color: "var(--text-1)", fontWeight: 600 }}>Parámetros y Preferencias</h2>
          <button onClick={() => { save(); onClose(); }} style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* ── Tabs Layout ─────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Sidebar Tabs */}
          <div style={{ width: "230px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.2)" }}>
            {menuItems.map(item => (
              <div 
                key={item.id} 
                onClick={() => setActiveTab(item.id)}
                style={{
                  padding: "14px 18px", cursor: "pointer", fontSize: "13px", fontWeight: 500,
                  color: activeTab === item.id ? "var(--text-1)" : "var(--text-3)",
                  background: activeTab === item.id ? "rgba(255,255,255,0.05)" : "transparent",
                  borderLeft: activeTab === item.id ? "3px solid var(--accent)" : "3px solid transparent",
                  display: "flex", alignItems: "center", gap: "10px", transition: "all 0.2s ease"
                }}
              >
                <span>{item.icon}</span> {item.label}
              </div>
            ))}
            
            <div style={{ marginTop: "auto", padding: "16px", borderTop: "1px solid var(--border)" }}>
              <button 
                onClick={() => { import('@tauri-apps/plugin-opener').then(m => m.openUrl("https://moset.org")).catch(e => console.error(e)); }}
                style={{ width: "100%", padding: "10px", background: "transparent", border: "1px solid var(--border)", color: "var(--accent)", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, transition: "all 0.2s" }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(90, 200, 255, 0.1)"}
                onMouseOut={e => e.currentTarget.style.background = "transparent"}
              >
                Visitar moset.org ↗
              </button>
            </div>
          </div>
          
          {/* Content Area */}
          <div className="settings-content" style={{ flex: 1, padding: "26px 30px", overflowY: "auto", color: "var(--text-1)" }}>
            {activeTab === "ide" && (
              <div className="anim-fade-in">
                <h3 style={{ margin: "0 0 20px 0", color: "var(--accent)", fontSize: "15px", fontWeight: 600 }}>Ajustes del IDE y Modelo Base</h3>
                
                <div className="form-group" style={{ marginBottom: "24px" }}>
                  <label style={labelStyle}>Ruta del Modelo Soberano (Archivo GGUF)</label>
                  <div className="form-input-row" style={{ display: "flex", gap: "10px" }}>
                    <input type="text" value={modelPath} onChange={e => setModelPath(e.target.value)} placeholder="C:/ruta/a/mi/modelo.gguf" className="search-input" style={{ flex: 1, padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                    <button className="form-browse-btn" onClick={() => openFileSelectorWrapper(setModelPath)} style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-1)", cursor: "pointer", padding: "0 14px", transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "var(--border)"} onMouseOut={e => e.currentTarget.style.background = "var(--bg-3)"}>
                      Examinar
                    </button>
                  </div>
                  <span className="form-hint" style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px', display: 'block' }}>
                    ℹ️ Se usará para inferencia local a menos que habilites Inteligencia en la Nube.
                  </span>
                </div>

                <div className="form-group" style={{ marginBottom: "24px", padding: "16px", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
                  <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                    <input type="checkbox" checked={glassEnabled} onChange={e => setGlassEnabled(e.target.checked)} style={{ transform: "scale(1.2)" }} />
                    <span>Activar Efectos Glassmorphism (Transparencia e Iluminación Premium)</span>
                  </label>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '8px', marginLeft: "25px" }}>
                    Desactívalo en PCs con bajos recursos y sin GPU dedicada. Mejora el rendimiento en reposo.
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "24px" }}>
                  <label style={labelStyle}>Pre-Prompt (Directiva de Sistema AI)</label>
                  <textarea 
                    style={textareaStyle} 
                    value={prePrompt} 
                    onChange={e => setPrePrompt(e.target.value)} 
                    placeholder="Instrucciones base para la IA..." 
                  />
                  <span className="form-hint" style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px', display: 'block' }}>
                    ℹ️ Instrucciones inyectadas antes de cada mensaje para moldear la respuesta (Ej: "Habla solo en español y usa siempre Async").
                  </span>
                </div>
              </div>
            )}

            {activeTab === "ai_providers" && (
              <div className="anim-fade-in">
                <h3 style={{ margin: "0 0 20px 0", color: "var(--accent)", fontSize: "15px", fontWeight: 600 }}>Proveedores de Inteligencia y APIs</h3>
                <div className="form-group" style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Proveedor de Inteligencia Principal</label>
                  <select 
                    value={aiProvider} 
                    onChange={e => setAiProvider(e.target.value)} 
                    className="search-input" 
                    style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }}
                  >
                    <option value="soberano">Motor Soberano (Local GGUF - Offline Segura)</option>
                    <option value="nube">Nube Estricta (APIs Externas solas)</option>
                    <option value="mixto">Mixto (Combina Nube y Local para delegar tareas)</option>
                  </select>
                </div>

                {(aiProvider === "nube" || aiProvider === "mixto") && (
                  <div className="form-group" style={{ marginBottom: "20px" }}>
                    <label style={labelStyle}>Servicios en la Nube y Agentes</label>
                    <select 
                      value={cloudProvider} 
                      onChange={e => setCloudProvider(e.target.value)} 
                      className="search-input" 
                      style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }}
                    >
                      <option value="openai">Ecosistema OpenAI (GPT / API Compatible / LM Studio / OpenRouter)</option>
                      <option value="google">Ecosistema Google (Gemini, Vertex)</option>
                      <option value="anthropic">Ecosistema Anthropic (Claube 3.5)</option>
                    </select>
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: "24px" }}>
                  <label style={labelStyle}>ID de Modelo Personalizado (Ej: claude-3-5-sonnet-20241022, gemini-1.5-pro, gpt-4o)</label>
                  <input type="text" value={customModelId} onChange={e => setCustomModelId(e.target.value)} placeholder="Dejar en blanco para usar el model predeterminado" className="search-input" style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                </div>

                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                  <h4 style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-1)" }}>Autenticación para API {cloudProvider.toUpperCase()}</h4>
                  {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "google" && (
                    <div className="form-group">
                      <label style={labelStyle}>Google API Key</label>
                      <input type="password" value={googleApiKey} onChange={e => setGoogleApiKey(e.target.value)} placeholder="AIzaSy..." className="search-input" style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                    </div>
                  )}

                  {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "anthropic" && (
                    <div className="form-group">
                      <label style={labelStyle}>Anthropic API Key</label>
                      <input type="password" value={anthropicApiKey} onChange={e => setAnthropicApiKey(e.target.value)} placeholder="sk-ant-api03-..." className="search-input" style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                    </div>
                  )}

                  {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "openai" && (
                    <>
                      <div className="form-group" style={{ marginBottom: "16px" }}>
                        <label style={labelStyle}>OpenAI API Key (O tu token para APIs Compatibles)</label>
                        <input type="password" value={openaiApiKey} onChange={e => setOpenaiApiKey(e.target.value)} placeholder="sk-..." className="search-input" style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                      </div>
                      <div className="form-group">
                        <label style={labelStyle}>Base URL Endpoint (Ideal para usar con Ollama remoto o LM Studio)</label>
                        <input type="text" value={openaiBaseUrl} onChange={e => setOpenaiBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className="search-input" style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === "orquestador" && (
              <div className="anim-fade-in">
                <h3 style={{ margin: "0 0 20px 0", color: "var(--accent)", fontSize: "15px", fontWeight: 600 }}>Comunicaciones del Orquestador N5</h3>
                <div style={{ marginBottom: "20px", padding: "12px 16px", background: "rgba(0,229,255,0.05)", borderRadius: "8px", border: "1px solid rgba(0,229,255,0.15)", fontSize: "12px", color: "var(--accent)", lineHeight: 1.5 }}>
                  💡 Estas IPs dirigen a dónde enviará Moset sus delegaciones cuando la IA no tenga suficiente poder local.
                </div>
                
                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <label style={labelStyle}>Nodo Primario (IP Local)</label>
                  <input type="text" value={orqLocalIp} onChange={e => setorqLocalIp(e.target.value)} placeholder="127.0.0.1" className="search-input" style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                </div>
                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <label style={labelStyle}>Nodo Cómputo (Server Remoto IP)</label>
                  <input type="text" value={orqRemoteIp} onChange={e => setorqRemoteIp(e.target.value)} placeholder="192.168.1.100" className="search-input" style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                </div>
                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <label style={labelStyle}>Puerto de Conexión N5 API</label>
                  <input type="text" value={orqApiPort} onChange={e => setOrqApiPort(e.target.value)} placeholder="8000" className="search-input" style={{ width: "120px", padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                </div>
                <div className="form-group" style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", marginTop: "16px" }}>
                  <label style={labelStyle}>Ruta del Perfil de Entorno (PowerShell Profile script)</label>
                  <input type="text" value={orqProfilePath} onChange={e => setOrqProfilePath(e.target.value)} placeholder="C:/Users/.../profile.ps1" className="search-input" style={{ width: '100%', padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-0)" }} />
                </div>
              </div>
            )}

            {activeTab === "vigilante" && (
              <div className="anim-fade-in">
                <h3 style={{ margin: "0 0 20px 0", color: "var(--accent)", fontSize: "15px", fontWeight: 600 }}>Configuración de Vigilante (Módulo de Seguridad)</h3>
                
                <div style={{ marginBottom: "20px", padding: "12px 16px", background: "rgba(255,80,80,0.05)", borderRadius: "8px", border: "1px solid rgba(255,80,80,0.15)", fontSize: "12px", color: "var(--danger)", lineHeight: 1.5 }}>
                  🛡️ El módulo Vigilante auditará cada proxy local y prohibirá la ejecución a través de perfiles de restricción léxica.
                </div>

                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <label style={{...labelStyle, marginBottom: 0, fontWeight: 600}}>⛔ Prohibidos Completamente</label>
                    <select onChange={(e) => applySecurityPreset('prohibidos', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-1)', border: '1px solid var(--border)', fontSize: '11px', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', outline: 'none'}}>
                      <option value="">Carga Rápida Preset...</option>
                      <option value="libertad">Anarquía (0 Restricciones)</option>
                      <option value="moderado">Medio (Sistema Base)</option>
                      <option value="suave">Aislado (Full Restricción)</option>
                    </select>
                  </div>
                  <textarea style={textareaStyle} value={vigProhibidos} onChange={e => setVigProhibidos(e.target.value)} placeholder="rm -rf /,format c:" />
                </div>

                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <label style={{...labelStyle, marginBottom: 0, fontWeight: 600}}>🔴 Peligrosos Condicionados (Requieren confirmación humana o Q=0.95)</label>
                  </div>
                  <textarea style={textareaStyle} value={vigPeligrosos} onChange={e => setVigPeligrosos(e.target.value)} placeholder="rm,del,shutdown,kill" />
                </div>

                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <label style={{...labelStyle, marginBottom: 0, fontWeight: 600}}>🟡 Cautelosos (Solo modo seguro)</label>
                  </div>
                  <textarea style={textareaStyle} value={vigCautelosos} onChange={e => setVigCautelosos(e.target.value)} placeholder="curl,wget,ssh,cargo" />
                </div>

                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <label style={{...labelStyle, marginBottom: 0, fontWeight: 600}}>🟢 Rutas Libres Autorizadas (Sandbox Bypasses)</label>
                  </div>
                  <textarea style={textareaStyle} value={vigSandboxPaths} onChange={e => setVigSandboxPaths(e.target.value)} placeholder="/workspace/project, C:/Proyectos" />
                </div>
              </div>
            )}

            {activeTab === "quantum" && (
              <div className="anim-fade-in">
                <h3 style={{ margin: "0 0 20px 0", color: "var(--accent)", fontSize: "15px", fontWeight: 600 }}>Opciones VRAM/GPU y Computación Avanzada</h3>
                
                <div style={{ padding: "20px", background: "var(--bg-0)", border: "1px solid var(--border)", borderRadius: "8px", marginBottom: "20px" }}>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--text-1)" }}>Sistema Cuántico · Entrelazamiento AST</h4>
                  <div className="form-group" style={{ marginBottom: "16px" }}>
                    <label style={labelStyle}>Técnica de Colapso (OP_QUANTUM_COLLAPSE)</label>
                    <select
                      value={qCollapseMethod}
                      onChange={e => setQCollapseMethod(e.target.value)}
                      className="search-input"
                      style={{ width: "100%", padding: "10px", fontSize: "12px", borderRadius: "6px", backgroundColor: "var(--bg-1)" }}
                    >
                      <option value="probabilistic">Determinador Probabilístico</option>
                      <option value="deterministic">Booleano Determinístco Clásico</option>
                      <option value="ai_assisted">Controlado por Motor Soberano (IA)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: "16px" }}>
                    <label style={labelStyle}>Alpha Inicial (Amplitud por defecto)</label>
                    <input type="text" value={qDefaultAlpha} onChange={e => setQDefaultAlpha(e.target.value)} placeholder="0.7071" className="search-input" style={{ width: "120px", padding: "10px", borderRadius: "6px", backgroundColor: "var(--bg-1)" }} />
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

                <div style={{ padding: "20px", background: "var(--bg-0)", border: "1px solid var(--border)", borderRadius: "8px", marginBottom: "20px" }}>
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
                      style={{ flex: 1, padding: "10px", background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "var(--fg-1)", borderRadius: "6px", cursor: "pointer", fontSize: "12px", transition: "all 0.2s", fontWeight: 500 }}
                      onMouseOver={e => e.currentTarget.style.background = "rgba(255,80,80,0.2)"}
                      onMouseOut={e => e.currentTarget.style.background = "rgba(255,80,80,0.1)"}
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
                      style={{ flex: 1, padding: "10px", background: "rgba(80,200,255,0.1)", border: "1px solid rgba(80,200,255,0.3)", color: "var(--fg-1)", borderRadius: "6px", cursor: "pointer", fontSize: "12px", transition: "all 0.2s", fontWeight: 500 }}
                      onMouseOver={e => e.currentTarget.style.background = "rgba(80,200,255,0.2)"}
                      onMouseOut={e => e.currentTarget.style.background = "rgba(80,200,255,0.1)"}
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
