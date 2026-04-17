import React, { useState, useRef, useCallback, useEffect } from "react";
import { Monaco, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Explorador } from "./components/Layout/Explorador";
import { CodeEditor } from "./components/Editor/CodeEditor";

// Configurar Monaco para usar la instancia local (offline)
loader.config({ monaco });
import ChatPanel from "./ChatPanel";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";
import "./styles/index.css";

// ─── Iconos Retro (importaciones estáticas via Vite) ─────────────────────────
import iconScript from "./assets/icons/script_file.ico";
import iconText from "./assets/icons/text_file.ico";
import iconWebpage from "./assets/icons/webpage_file.ico";
import iconImage from "./assets/icons/image_file.ico";
import iconAudio from "./assets/icons/audio_file.ico";
import iconVideo from "./assets/icons/video_file.ico";
import iconWorkspace from "./assets/icons/workspace.ico";
import iconSpreadsheet from "./assets/icons/spreadsheet_file.ico";
import iconGithub from "./assets/icons/github.ico";
import iconPassword from "./assets/icons/password_manager.ico";
import iconStickyNote from "./assets/icons/sticky_note.ico";
import iconPaint from "./assets/icons/paint.ico";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface FileTab {
  id: string;
  name: string;
  fullPath: string | null; // null = archivo virtual (sin guardar en disco)
  language: string;
  content: string;
  modified: boolean;
}

interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  language?: string;
  children?: TreeNode[];
  open?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "et": case "moset": return "moset";
    case "md": case "markdown": return "markdown";
    case "js": return "javascript";
    case "ts": return "typescript";
    case "tsx": return "typescript";
    case "json": return "json";
    case "rs": return "rust";
    case "py": return "python";
    case "html": return "html";
    case "css": return "css";
    default: return "plaintext";
  }
}

interface Extension {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
}

// ─── Datos iniciales ──────────────────────────────────────────────────────────
const WELCOME_CODE = `:@ Bienvenido a Moset IDE — Motor Soberano
:@ Lenguaje Moset v0.2 | Archivos: .et

molde Persona:
    nombre: Texto
    edad:   Entero

:,] saludar(p):
    devolver "Hola, " + p.nombre + "!"

:@ Quantum bit — colapsa al observarse con !
x = Bit:~
si x!:
    mostrar "Cara"
sino:
    mostrar "Seca"
`;

const INITIAL_TABS: FileTab[] = [
  { id: "main", name: "main.et", fullPath: null, language: "moset", content: WELCOME_CODE, modified: false },
];

const FILE_ICON_MAP: Record<string, string> = {
  ".et":   iconScript,    // Moset files → script retro icon
  ".rs":   iconScript,
  ".toml": iconWorkspace,
  ".md":   iconStickyNote,
  ".ts":   iconScript,
  ".tsx":  iconScript,
  ".json": iconSpreadsheet,
  ".css":  iconPaint,
  ".py":   iconScript,
  ".js":   iconScript,
  ".html": iconWebpage,
  ".sh":   iconScript,
  ".txt":  iconText,
  ".lock": iconPassword,
  ".png":  iconImage,
  ".jpg":  iconImage,
  ".jpeg": iconImage,
  ".svg":  iconImage,
  ".gif":  iconImage,
  ".webp": iconImage,
  ".mp3":  iconAudio,
  ".wav":  iconAudio,
  ".ogg":  iconAudio,
  ".mp4":  iconVideo,
  ".webm": iconVideo,
  ".yml":  iconWorkspace,
  ".yaml": iconWorkspace,
  ".git":  iconGithub,
};

function getIconSrc(name: string): string {
  const ext = name.slice(name.lastIndexOf("."));
  return FILE_ICON_MAP[ext] ?? iconText;
}

export function FileIcon({ name, size = 15 }: { name: string; size?: number }) {
  return <img src={getIconSrc(name)} alt="" width={size} height={size} style={{ imageRendering: "pixelated" }} />;
}


// ─── Componentes ──────────────────────────────────────────────────────────────

function ExtensionManager() {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [extSearchQuery, setExtSearchQuery] = useState("");

  useEffect(() => {
    invoke("fetch_extensions").then((res: any) => setExtensions(res)).catch(console.error);
  }, []);

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await invoke("toggle_extension", { id, enabled });
      setExtensions(exts => exts.map(e => e.id === id ? { ...e, enabled } : e));
    } catch (err) {
      console.error("Failed to toggle extension:", err);
    }
  };

  return (
    <div className="extension-manager sidebar-placeholder">
      <div className="sidebar-section-title">EXTENSIONES INSTALADAS</div>
      <input
        className="search-input"
        placeholder="Buscar extensiones..."
        value={extSearchQuery}
        onChange={(e) => setExtSearchQuery(e.target.value)}
        style={{ marginTop: '10px', marginBottom: '5px', width: '100%', boxSizing: 'border-box' }}
      />
      <div className="ext-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>
        {extensions
          .filter(ext => ext.name.toLowerCase().includes(extSearchQuery.toLowerCase()) || ext.description.toLowerCase().includes(extSearchQuery.toLowerCase()))
          .map(ext => (
          <div key={ext.id} className="ext-item-card" style={{ background: 'var(--bg-3)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border)' }}>
            <div className="ext-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <span className="ext-name" style={{ fontWeight: 'bold', fontSize: '13px' }}>{ext.name}</span>
              <span className="ext-version" style={{ fontSize: '11px', color: '#888' }}>v{ext.version}</span>
            </div>
            <div className="ext-desc" style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px', lineHeight: '1.4' }}>{ext.description}</div>
            <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={ext.enabled} onChange={(e) => toggle(ext.id, e.target.checked)} />
              <span style={{ color: ext.enabled ? 'var(--accent)' : '#aaa', fontWeight: ext.enabled ? 'bold' : 'normal' }}>
                {ext.enabled ? "Habilitada" : "Apagada"}
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ onUpdate, onClose }: { onUpdate: () => void; onClose: () => void }) {
  const [modelPath, setModelPath] = useState(() => localStorage.getItem("moset_model_path") || "");
  const [glassEnabled, setGlassEnabled] = useState(true);

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

  // Accordion
  const [openSection, setOpenSection] = useState<string>("ide");

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
    const savedModel = localStorage.getItem("moset_model_path") || "";
    setModelPath(savedModel);

    // IA Providers
    setAiProvider(localStorage.getItem("moset_ai_provider") || "soberano");
    setCloudProvider(localStorage.getItem("moset_cloud_provider") || "openai");
    setGoogleApiKey(localStorage.getItem("moset_google_api_key") || "");
    setAnthropicApiKey(localStorage.getItem("moset_anthropic_api_key") || "");
    setOpenaiApiKey(localStorage.getItem("moset_openai_api_key") || "");
    setOpenaiBaseUrl(localStorage.getItem("moset_openai_base_url") || "");
    setCustomModelId(localStorage.getItem("moset_custom_model_id") || "");

    // Orquestador
    setorqLocalIp(localStorage.getItem("moset_orq_local_ip") || "127.0.0.1");
    setorqRemoteIp(localStorage.getItem("moset_orq_remote_ip") || "192.168.1.100");
    setOrqApiPort(localStorage.getItem("moset_orq_api_port") || "8000");
    setOrqProfilePath(localStorage.getItem("moset_orq_profile_path") || "");

    // Vigilante
    setVigProhibidos(localStorage.getItem("moset_vig_prohibidos") || "rm -rf /,rm -rf /*,dd if=/dev/zero,format c:,del /f /s /q C:");
    setVigPeligrosos(localStorage.getItem("moset_vig_peligrosos") || "rm,del,rmdir,format,shutdown,reboot,kill,taskkill,chmod,chown,reg,regedit");
    setVigCautelosos(localStorage.getItem("moset_vig_cautelosos") || "curl,wget,ssh,scp,python,node,cargo,npm,pip,powershell,bash");
    setVigSandboxPaths(localStorage.getItem("moset_vig_sandbox") || "/workspace/project");

    // Cuántica
    setQCollapseMethod(localStorage.getItem("moset_q_collapse") || "probabilistic");
    setQDefaultAlpha(localStorage.getItem("moset_q_alpha") || "0.7071");
    setQEntanglementEnabled(localStorage.getItem("moset_q_entanglement") === "true");
    setQPensarEnabled(localStorage.getItem("moset_q_pensar") !== "false");

    // CUDA
    const savedCuda = localStorage.getItem("moset_cuda_autoclean") === "true";
    setCudaCacheAutoClean(savedCuda);
    invoke("set_clean_cuda_on_exit", { enabled: savedCuda }).catch(console.error);
  }, []);

  const openFileSelector = async (setter: React.Dispatch<React.SetStateAction<string>>) => {
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


  const save = () => {
    localStorage.setItem("moset_model_path", modelPath);

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
    localStorage.setItem("moset_q_entanglement", String(qEntanglementEnabled));
    localStorage.setItem("moset_q_pensar", String(qPensarEnabled));

    localStorage.setItem("moset_cuda_autoclean", String(cudaCacheAutoClean));
    invoke("set_clean_cuda_on_exit", { enabled: cudaCacheAutoClean }).catch(console.error);

    // Feedback visual
    const toast = document.createElement('div');
    toast.textContent = 'Ajustes guardados correctamente';
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--accent);color:#000;padding:12px 24px;border-radius:8px;font-weight:bold;z-index:10000;animation:fadeInOut 3s forwards;';
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);

    onUpdate();
  };

  const toggleSection = (id: string) => setOpenSection(prev => prev === id ? "" : id);

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
    padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: "12px",
    fontWeight: "bold", color: "var(--accent)", letterSpacing: "0.5px",
    userSelect: "none",
  };

  const labelStyle: React.CSSProperties = { fontSize: "11px", color: "#aaa", marginBottom: "4px", display: "block" };

  const textareaStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px", fontSize: "11px",
    backgroundColor: "var(--bg-3)", border: "1px solid var(--border)",
    color: "var(--fg)", borderRadius: "4px", resize: "vertical", minHeight: "60px",
    fontFamily: "monospace",
  };

  return (
    <div className="settings-overlay anim-fade-in" onClick={() => { save(); onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div className="settings-modal" onClick={e => e.stopPropagation()} style={{
        background: "var(--bg-1)",
        border: "1px solid var(--border)", borderRadius: "12px",
        width: "700px", maxWidth: "90vw", maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)"
      }}>
        <div className="settings-header" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px", borderBottom: "1px solid var(--border)"
        }}>
          <h2 style={{ fontSize: "16px", margin: 0, color: "var(--text-1)", fontWeight: 600 }}>Ajustes del Sistema Soberano</h2>
          <button onClick={() => { save(); onClose(); }} style={{ background: "transparent", border: "none", color: "var(--text-2)", cursor: "pointer", fontSize: "18px" }}>✕</button>
        </div>
        <div className="settings-content" style={{ padding: "8px 24px 24px 24px", overflowY: "auto", flex: 1, color: "var(--text-1)" }}>

      {/* ── IDE ─────────────────────────────────── */}
      <div style={sectionHeaderStyle} onClick={() => toggleSection("ide")}>
        <span>{openSection === "ide" ? "▾" : "▸"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Motor Soberano (IDE)</span>
      </div>
      {openSection === "ide" && (
        <div style={{ padding: "10px 0" }}>
          <div className="form-group">
            <label style={labelStyle}>Carpeta de Modelos / Archivo GGUF</label>
            <div className="form-input-row" style={{ display: "flex", gap: "8px" }}>
              <input type="text" value={modelPath} onChange={e => setModelPath(e.target.value)} placeholder="C:/ruta/a/mi/modelo.gguf" className="search-input" style={{ flex: 1 }} />
              <button className="form-browse-btn" onClick={() => openFileSelector(setModelPath)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", color: "var(--text-1)", cursor: "pointer", padding: "4px 8px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </button>
            </div>
            <span className="form-hint" style={{ fontSize: '9px', color: 'var(--text-3)', marginTop: '4px', display: 'block' }}>
              ℹ️ Se asume que el archivo 'tokenizer.json' está en la misma carpeta.
            </span>
          </div>
          <div className="form-group" style={{ marginTop: "12px" }}>
            <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
              <input type="checkbox" checked={glassEnabled} onChange={(e) => {
                setGlassEnabled(e.target.checked);
                document.documentElement.style.setProperty('--glass', e.target.checked ? "blur(20px) saturate(180%)" : "none");
              }} />
              <span>Glassmorphism Premium</span>
            </label>
          </div>
        </div>
      )}

      {/* ── Proveedores de IA ──────────────────────── */}
      <div style={sectionHeaderStyle} onClick={() => toggleSection("ai_providers")}>
        <span>{openSection === "ai_providers" ? "▾" : "▸"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <span>Proveedores de Inteligencia (Nube/Local)</span>
      </div>
      {openSection === "ai_providers" && (
        <div style={{ padding: "10px 0" }}>
          <div className="form-group">
            <label style={labelStyle}>Proveedor Activo</label>
            <select 
              value={aiProvider} 
              onChange={e => setAiProvider(e.target.value)} 
              className="search-input" 
              style={{ width: '100%', marginBottom: '12px' }}
            >
              <option value="soberano">Motor Soberano (Local GGUF)</option>
              <option value="nube">Nube (APIs Externas)</option>
              <option value="mixto">Mixto (Híbrido)</option>
            </select>
          </div>

          {(aiProvider === "nube" || aiProvider === "mixto") && (
            <div className="form-group">
              <label style={labelStyle}>Proveedor de Nube Adicional</label>
              <select 
                value={cloudProvider} 
                onChange={e => setCloudProvider(e.target.value)} 
                className="search-input" 
                style={{ width: '100%', marginBottom: '12px' }}
              >
                <option value="google">Google (Gemini API)</option>
                <option value="anthropic">Anthropic (Claude API)</option>
                <option value="openai">OpenAI / Compatible (ChatGPT, LM Studio)</option>
              </select>
            </div>
          )}

          <div className="form-group" style={{ marginTop: "8px" }}>
            <label style={labelStyle}>ID de Modelo Personalizado (Ej: claude-3-5-sonnet-20241022, gemini-1.5-pro, gpt-4o)</label>
            <input type="text" value={customModelId} onChange={e => setCustomModelId(e.target.value)} placeholder="Dejar en blanco para usar el default del proveedor" className="search-input" />
          </div>

          {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "google" && (
            <div className="form-group" style={{ marginTop: "8px", padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <label style={labelStyle}>Google API Key</label>
              <input type="password" value={googleApiKey} onChange={e => setGoogleApiKey(e.target.value)} placeholder="AIzaSy..." className="search-input" />
              <div style={{fontSize: "10px", color: "#8cf", marginTop: "4px"}}>Obtén tu API key en Google AI Studio.</div>
            </div>
          )}

          {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "anthropic" && (
            <div className="form-group" style={{ marginTop: "8px", padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <label style={labelStyle}>Anthropic API Key</label>
              <input type="password" value={anthropicApiKey} onChange={e => setAnthropicApiKey(e.target.value)} placeholder="sk-ant-api03-..." className="search-input" />
              <div style={{fontSize: "10px", color: "#8cf", marginTop: "4px"}}>Obtén tu API key en Anthropic Console.</div>
            </div>
          )}

          {(aiProvider === "nube" || aiProvider === "mixto") && cloudProvider === "openai" && (
            <div className="form-group" style={{ marginTop: "8px", padding: "10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
              <label style={labelStyle}>OpenAI API Key</label>
              <input type="password" value={openaiApiKey} onChange={e => setOpenaiApiKey(e.target.value)} placeholder="sk-..." className="search-input" />
              
              <label style={{...labelStyle, marginTop: "8px"}}>Base URL (Opcional, para usar LM Studio, xAI, OpenRouter, etc)</label>
              <input type="text" value={openaiBaseUrl} onChange={e => setOpenaiBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" className="search-input" />
            </div>
          )}
        </div>
      )}

      {/* ── Orquestador ──────────────────────── */}
      <div style={sectionHeaderStyle} onClick={() => toggleSection("orquestador")}>
        <span>{openSection === "orquestador" ? "▾" : "▸"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
        </svg>
        <span>Orquestador</span>
      </div>
      {openSection === "orquestador" && (
        <div style={{ padding: "10px 0" }}>
          <div className="form-group">
            <label style={labelStyle}>Nodo Primario (Local) — IP / Hostname</label>
            <input type="text" value={orqLocalIp} onChange={e => setorqLocalIp(e.target.value)} placeholder="127.0.0.1" className="search-input" />
          </div>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <label style={labelStyle}>Nodo Remoto (Inferencia/Compute) — IP / Hostname</label>
            <input type="text" value={orqRemoteIp} onChange={e => setorqRemoteIp(e.target.value)} placeholder="192.168.1.100" className="search-input" />
          </div>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <label style={labelStyle}>Puerto API Orquestador</label>
            <input type="text" value={orqApiPort} onChange={e => setOrqApiPort(e.target.value)} placeholder="8000" className="search-input" style={{ width: "80px" }} />
          </div>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <label style={labelStyle}>Ruta PowerShell Profile (Orquestador)</label>
            <input type="text" value={orqProfilePath} onChange={e => setOrqProfilePath(e.target.value)} placeholder="C:/Users/.../profile.ps1" className="search-input" />
          </div>
          <div style={{ marginTop: "10px", padding: "8px", background: "rgba(0,229,255,0.05)", borderRadius: "4px", border: "1px solid rgba(0,229,255,0.15)", fontSize: "11px", color: "#8cf" }}>
            💡 Estas IPs se usarán para SSH/API a los nodos del ecosistema Naraka desde el IDE.
          </div>
        </div>
      )}

      {/* ── Vigilante (Security) ────────────────── */}
      <div style={sectionHeaderStyle} onClick={() => toggleSection("vigilante")}>
        <span>{openSection === "vigilante" ? "▾" : "▸"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>Vigilante (Seguridad)</span>
      </div>
      {openSection === "vigilante" && (
        <div style={{ padding: "10px 0" }}>
          <div className="form-group">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
              <label style={{...labelStyle, marginBottom: 0}}>⛔ Comandos Prohibidos <span style={{color:"#f44"}}>(NUNCA se ejecutan)</span></label>
              <select onChange={(e) => applySecurityPreset('prohibidos', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: '10px', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', outline: 'none'}}>
                <option value="">Personalizado...</option>
                <option value="libertad">Libertad Total</option>
                <option value="moderado">Moderado</option>
                <option value="suave">Suave</option>
              </select>
            </div>
            <textarea style={textareaStyle} value={vigProhibidos} onChange={e => setVigProhibidos(e.target.value)} placeholder="rm -rf /,format c:" />
          </div>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
              <label style={{...labelStyle, marginBottom: 0}}>🔴 Comandos Peligrosos <span style={{color:"#fa0"}}>(requieren Bit ≥ 0.95)</span></label>
              <select onChange={(e) => applySecurityPreset('peligrosos', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: '10px', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', outline: 'none'}}>
                <option value="">Personalizado...</option>
                <option value="libertad">Libertad Total</option>
                <option value="moderado">Moderado</option>
                <option value="suave">Suave</option>
              </select>
            </div>
            <textarea style={textareaStyle} value={vigPeligrosos} onChange={e => setVigPeligrosos(e.target.value)} placeholder="rm,del,shutdown,kill" />
          </div>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
              <label style={{...labelStyle, marginBottom: 0}}>🟡 Comandos Cautelosos <span style={{color:"#ff0"}}>(requieren Bit ≥ 0.75)</span></label>
              <select onChange={(e) => applySecurityPreset('cautelosos', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: '10px', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', outline: 'none'}}>
                <option value="">Personalizado...</option>
                <option value="libertad">Libertad Total</option>
                <option value="moderado">Moderado</option>
                <option value="suave">Suave</option>
              </select>
            </div>
            <textarea style={textareaStyle} value={vigCautelosos} onChange={e => setVigCautelosos(e.target.value)} placeholder="curl,wget,ssh,cargo" />
          </div>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
              <label style={{...labelStyle, marginBottom: 0}}>🟢 Rutas Sandbox (el Agente solo puede modificar dentro de estas)</label>
              <select onChange={(e) => applySecurityPreset('sandbox', e.target.value)} style={{background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: '10px', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer', outline: 'none'}}>
                <option value="">Personalizado...</option>
                <option value="libertad">Libertad Total</option>
                <option value="moderado">Moderado</option>
                <option value="suave">Suave</option>
              </select>
            </div>
            <textarea style={textareaStyle} value={vigSandboxPaths} onChange={e => setVigSandboxPaths(e.target.value)} placeholder="/workspace/project, C:/Proyectos" />
          </div>
          <div style={{ marginTop: "10px", padding: "8px", background: "rgba(255,68,68,0.05)", borderRadius: "4px", border: "1px solid rgba(255,68,68,0.15)", fontSize: "11px", color: "#f88" }}>
            🛡️ El Vigilante audita TODOS los comandos antes de ejecutarlos. Separar valores con comas.
          </div>
        </div>
      )}

      {/* ── Inteligencia Cuántica ───────────────── */}
      <div style={sectionHeaderStyle} onClick={() => toggleSection("quantum")}>
        <span>{openSection === "quantum" ? "▾" : "▸"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" fill="rgba(138,43,226,0.3)"/>
          <circle cx="12" cy="12" r="8" strokeDasharray="3 3"/>
          <circle cx="12" cy="12" r="11" strokeDasharray="1 3"/>
        </svg>
        <span>Inteligencia Cuántica</span>
      </div>
      {openSection === "quantum" && (
        <div style={{ padding: "10px 0" }}>
          <div className="form-group">
            <label style={labelStyle}>Método de Colapso (OP_QUANTUM_COLLAPSE)</label>
            <select
              value={qCollapseMethod}
              onChange={e => setQCollapseMethod(e.target.value)}
              className="search-input"
              style={{ width: "100%", padding: "6px 8px", fontSize: "12px" }}
            >
              <option value="probabilistic">Probabilístico (Born Rule)</option>
              <option value="deterministic">Determinístico (α² ≥ 0.5 → true)</option>
              <option value="ai_assisted">Asistido por IA (Motor Soberano decide)</option>
            </select>
          </div>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <label style={labelStyle}>Alpha por defecto (Bit:~ amplitude |0⟩)</label>
            <input type="text" value={qDefaultAlpha} onChange={e => setQDefaultAlpha(e.target.value)} placeholder="0.7071 (√½)" className="search-input" style={{ width: "120px" }} />
            <span style={{ fontSize: "10px", color: "#888", marginLeft: "8px" }}>√½ ≈ 0.7071 = 50/50</span>
          </div>
          <div className="form-group" style={{ marginTop: "12px" }}>
            <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
              <input type="checkbox" checked={qEntanglementEnabled} onChange={e => setQEntanglementEnabled(e.target.checked)} />
              <span>Entrelazamiento Cuántico (Bit correlacionados)</span>
            </label>
          </div>
          <div className="form-group" style={{ marginTop: "8px" }}>
            <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
              <input type="checkbox" checked={qPensarEnabled} onChange={e => setQPensarEnabled(e.target.checked)} />
              <span>Pensar Mode (Shadow Environment aislado)</span>
            </label>
          </div>
          <div style={{ marginTop: "10px", padding: "8px", background: "rgba(138,43,226,0.05)", borderRadius: "4px", border: "1px solid rgba(138,43,226,0.2)", fontSize: "11px", color: "#c8f" }}>
            ⚛️ Controla el comportamiento de Bit:~ y OP_QUANTUM_COLLAPSE en la VM bytecode.
          </div>
        </div>
      )}

      {/* ── GPU / CUDA ──────────────────────────── */}
      <div style={sectionHeaderStyle} onClick={() => toggleSection("gpu")}>
        <span>{openSection === "gpu" ? "▾" : "▸"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/>
          <line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/>
        </svg>
        <span>GPU / CUDA</span>
      </div>
      {openSection === "gpu" && (
        <div style={{ padding: "10px 0" }}>
          <div className="form-group">
            <label className="ext-toggle" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
              <input type="checkbox" checked={cudaCacheAutoClean} onChange={e => setCudaCacheAutoClean(e.target.checked)} />
              <span>Auto-limpiar CUDA Cache al cerrar IDE</span>
            </label>
            <div style={{ fontSize: "10px", color: "#888", marginTop: "4px", paddingLeft: "24px" }}>
              Elimina DXCache + ComputeCache de NVIDIA al salir (recupera ~7GB en disco)
            </div>
          </div>
          <div style={{ marginTop: "10px", padding: "8px", background: "rgba(118,185,0,0.05)", borderRadius: "4px", border: "1px solid rgba(118,185,0,0.2)", fontSize: "11px", color: "#9d8" }}>
            🖥️ RTX 5070 Ti · 16 GB VRAM · Contexto máx: 24K chars (~6K tokens)
          </div>
        </div>
      )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '24px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={async () => {
                  try {
                    await invoke("descargar_modelo");
                    alert("Motor Soberano descargado. RAM/vRAM liberada exitosamente.");
                  } catch(e) {
                    alert("Error liberando memoria: " + e);
                  }
                }}
                style={{ flex: 1, padding: "8px", background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "var(--fg-1)", borderRadius: "6px", cursor: "pointer", fontSize: "12px", transition: "all 0.2s" }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(255,80,80,0.2)"}
                onMouseOut={e => e.currentTarget.style.background = "rgba(255,80,80,0.1)"}
              >
                Liberar vRAM y RAM
              </button>
              <button 
                onClick={async () => {
                  try {
                    await invoke("clean_cuda_cache");
                    alert("Compilaciones CUDA antiguas eliminadas correctamente.");
                  } catch(e) {
                    alert("Error limpiando CUDA: " + e);
                  }
                }}
                style={{ flex: 1, padding: "8px", background: "rgba(80,200,255,0.1)", border: "1px solid rgba(80,200,255,0.3)", color: "var(--fg-1)", borderRadius: "6px", cursor: "pointer", fontSize: "12px", transition: "all 0.2s" }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(80,200,255,0.2)"}
                onMouseOut={e => e.currentTarget.style.background = "rgba(80,200,255,0.1)"}
              >
                Limpiar Compilaciones CUDA
              </button>
            </div>
            <button 
              onClick={() => {
                import('@tauri-apps/plugin-opener').then(m => m.openUrl("https://moset.org")).catch(e => console.error(e));
              }}
              style={{ width: "100%", padding: "8px", background: "transparent", border: "1px solid var(--border)", color: "var(--accent)", borderRadius: "6px", cursor: "pointer", fontSize: "12px", transition: "all 0.2s" }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(90, 200, 255, 0.1)"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >
              Visitar sitio web moset.org ↗
            </button>
          </div>
          <button className="config-load-btn" onClick={() => { save(); onClose(); }} style={{ marginTop: "12px", width: "100%", padding: "10px", fontSize: "12px" }}>Guardar y Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function ActivityBar({ active, setActive, chatOpen, setChatOpen }: {
  active: string;
  setActive: (s: string) => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
}) {
  const items = [
    { id: "explorer", icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ), label: "Explorador" },
    { id: "search", icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ), label: "Buscar" },
    { id: "run", icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    ), label: "Ejecutar" },
    { id: "extensions", icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    ), label: "Extensiones" },
  ];
  return (
    <div className="activity-bar">
      <div className="activity-bar-logo" title="Moset IDE" style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "15px" }}>
        <img src="/moset-logo.png" alt="Moset" style={{ width: 34, height: 34, objectFit: "contain", backgroundColor: "white", padding: "2px", filter: "drop-shadow(0 0 8px rgba(0,229,255,0.4))", borderRadius: "8px" }} />
      </div>
      {items.map(item => (
        <button
          key={item.id}
          className={`activity-btn ${active === item.id ? "active" : ""}`}
          onClick={() => setActive(active === item.id ? "" : item.id)}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}
      <div className="activity-bar-spacer" />
      <button
        className={`activity-btn bottom ${chatOpen ? "active" : ""}`}
        onClick={() => setChatOpen(!chatOpen)}
        title="Soberano AI"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="6"/>
          <line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="6" y2="12"/>
          <line x1="18" y1="12" x2="22" y2="12"/>
        </svg>
      </button>
      <button
        className={`activity-btn bottom ${active === "settings" ? "active" : ""}`}
        title="Configuración"
        onClick={() => setActive(active === "settings" ? "" : "settings")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  );
}


function TabBar({ tabs, activeId, onSelect, onClose }: {
  tabs: FileTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab ${activeId === tab.id ? "tab-active" : ""}`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab-icon"><FileIcon name={tab.name} size={13} /></span>
          <span className="tab-name">{tab.name}</span>
          {tab.modified && <span className="tab-dot">��</span>}
          <button
            className="tab-close"
            onClick={e => { e.stopPropagation(); onClose(tab.id); }}
          >�</button>
        </div>
      ))}
    </div>
  );
}

function TerminalComponent() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      fontSize: 14,
      theme: {
        background: "#070810",
        foreground: "#DCE4F5",
        cursor: "#00A8FF",
        black: "#181B2A",
        brightBlack: "#3D4A6B",
        blue: "#00A8FF",
        cyan: "#00D4FF",
        green: "#00E5A0",
      },
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const onDataDisposable = term.onData(data => {
      invoke("write_pty", { data }).catch(err => console.error("PTY Write Error:", err));
    });

    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      invoke("resize_pty", { cols, rows }).catch(err => console.error("PTY Resize Error:", err));
    });

    let unlisten: (() => void) | null = null;
    listen<string>("pty-read", (event) => {
      term.write(event.payload);
    }).then(u => {
      unlisten = u;
    });

    let unlistenExit: (() => void) | null = null;
    listen<void>("pty-exit", () => {
      term.write("\r\n\x1b[31m[Process exited] PTY connection lost.\x1b[0m\r\n");
    }).then(u => {
      unlistenExit = u;
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      unlisten?.();
      unlistenExit?.();
      window.removeEventListener("resize", handleResize);
      term.dispose();
    };
  }, []);

  return (
    <div className="terminal">
      <div className="terminal-header">
        <span>MOSET PTY</span>
        <span className="terminal-tabs">
          <span className="terminal-tab active">powershell</span>
        </span>
      </div>
      <div className="terminal-body pty-container" ref={terminalRef} style={{ height: "100%", width: "100%", paddingLeft: "8px" }} />
    </div>
  );
}

function StatusBar({ file, lang, projectRoot, saved, cursorPos }: {
  file: string;
  lang: string;
  projectRoot: string | null;
  saved: boolean;
  cursorPos: { lineNumber: number; column: number };
}) {
  const projectName = projectRoot
    ? projectRoot.replace(/\\/g, "/").split("/").pop() ?? "proyecto"
    : null;

  return (
    <div className="status-bar">
      <div className="status-left">
        {projectName && <span className="status-item status-project">�! {projectName}</span>}
        <span className="status-item">�� Moset IDE v0.2</span>
      </div>
      <div className="status-right">
        {file && <span className={`status-item ${saved ? "" : "status-unsaved"}`}>{file}{saved ? "" : " ��"}</span>}
        {lang && <span className="status-item">{lang.toUpperCase()}</span>}
        <span className="status-item">UTF-8</span>
        <span className="status-item">Ln {cursorPos.lineNumber}, Col {cursorPos.column}</span>
      </div>
    </div>
  );
}

// ������ Setup Monaco para Moset ����������������������������������������������������������������������������������������������������
function setupMonaco(monacoInstance: Monaco) {
  monacoInstance.languages.register({ id: "moset" });

  monacoInstance.languages.setMonarchTokensProvider("moset", {
    keywords: [
      "molde", "devolver", "si", "sino", "mientras",
      "por", "cada", "en", "mostrar", "importar",
      "verdadero", "falso", "nulo", "pensar",
    ],
    typeKeywords: ["Texto", "Entero", "Decimal", "Booleano", "Lista"],
    tokenizer: {
      root: [
        [/:@.*$/, "comment"],
        [/\/\/.*$/, "comment"],
        [/"[^"]*"/, "string"],
        [/\b\d+(\.\d+)?\b/, "number"],
        [/\b(molde|devolver|si|sino|mientras|por|cada|en|mostrar|importar|verdadero|falso|nulo|pensar)\b/, "keyword"],
        [/\b(Texto|Entero|Decimal|Booleano|Lista)\b/, "type"],
        [/[a-zA-Z_]\w*/, "identifier"],
        [/[{}()[\]]/, "delimiter.bracket"],
        [/[+\-*\/=<>!]+/, "operator"],
      ],
    },
  });

  monacoInstance.editor.defineTheme("moset-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword",    foreground: "00A8FF", fontStyle: "bold" },
      { token: "type",       foreground: "00E5A0" },
      { token: "string",     foreground: "8BC4E8" },
      { token: "comment",    foreground: "3D4A6B", fontStyle: "italic" },
      { token: "number",     foreground: "7CB9FF" },
      { token: "operator",   foreground: "8899BB" },
      { token: "identifier", foreground: "DCE4F5" },
    ],
    colors: {
      "editor.background":                 "#070810",
      "editor.foreground":                 "#DCE4F5",
      "editorLineNumber.foreground":       "#252840",
      "editorLineNumber.activeForeground": "#8899BB",
      "editor.selectionBackground":        "#00A8FF22",
      "editor.lineHighlightBackground":    "#10121E",
      "editorCursor.foreground":           "#00A8FF",
      "editorWhitespace.foreground":       "#181B2A",
    },
  });

  // ������ Tab Snippets para Moset ������������������������������������������������������������������������������������������
  monacoInstance.languages.registerCompletionItemProvider("moset", {
    triggerCharacters: [".", "@"],
    provideCompletionItems(model: any, position: any) {
      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: position.column,
      };

      // Look at what's before the cursor on this line

      const suggestions: monaco.languages.CompletionItem[] = [
        // `:,]` � definir función
        {
          label: "..",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ",] ${1:nombre}(${2:args}):\n    ${3:cuerpo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,] � Definir función/rutina en Moset",
          detail: ":,] función",
          range,
        },
        // `:,[` � catch inline
        {
          label: "...",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ",[ ${1:error}:\n    ${2:manejo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,[ � Catch en línea (manejo de errores)",
          detail: ":,[ catch",
          range,
        },
        // `:,\` � esperar
        {
          label: "....",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ",\\ ${1:promesa}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,\\ � Esperar (async/await)",
          detail: ":,\\ esperar",
          range,
        },
        // `:@` � comentario
        {
          label: "@",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "@ ${1:comentario}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":@ � Comentario en Moset",
          detail: ":@ comentario",
          range,
        },
        // molde completo
        {
          label: "molde",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "molde ${1:Nombre}:\n    ${2:campo}: ${3:Texto}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Definir un Molde (struct)",
          detail: "molde Nombre:",
          range,
        },
        // pensar
        {
          label: "pensar",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "pensar {\n    ${1:codigo}\n}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Shadow Environment � simula sin efectos colaterales",
          detail: "pensar { }",
          range,
        },
        // Bit cuántico
        {
          label: "Bit:~",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "Bit:~",
          documentation: "Bit cuántico en superposición 50/50",
          detail: "Bit cuántico",
          range,
        },
        // Bit sesgado
        {
          label: "Bit:[]",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "Bit:[${1:0.85}]",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Bit cuántico sesgado con probabilidad custom",
          detail: "Bit:[prob]",
          range,
        },
      ];

      // Filtramos según si la línea empieza con ':'
      return { suggestions };
    },
  });

  // ������ Atajo Tab para caritas Moset ����������������������������������������������������������������������������������
  // Monaco maneja Tab completions via el provider de arriba, pero para
  // el caso de escribir literalmente ".." seguido de Tab sin popup:
  monacoInstance.editor.addEditorAction({
    id: "moset.tab-snippet",
    label: "Moset: Insertar carita",
    keybindings: [monacoInstance.KeyCode.Tab],
    precondition: undefined,
    run(editor: any) {
      const model = editor.getModel();
      if (!model) return;
      const pos = editor.getPosition();
      if (!pos) return;

      const line = model.getLineContent(pos.lineNumber);
      const before = line.slice(0, pos.column - 1);

      // Casos de sustitución directa de puntos y @
      const replacements: [RegExp, string][] = [
        [/:\.\.\.\.$/, ":,\\"],   // :.... �  :,\
        [/:\.\.\.$/, ":["],       // :...  �  :,[  (pero con el formato completo)
        [/:\.\.$/, ":,]"],        // :..   �  :,]
        [/:@$/, ":@"],            // :@    �  :@  (ya correcto, solo confirma)
      ];

      for (const [pattern, replacement] of replacements) {
        const m = before.match(pattern);
        if (m) {
          const start = pos.column - m[0].length;
          editor.executeEdits("moset-snippet", [{
            range: new monacoInstance.Range(
              pos.lineNumber, start,
              pos.lineNumber, pos.column
            ),
            text: replacement,
          }]);
          return; // consumimos el Tab
        }
      }

      // Si no hubo match, comportamiento normal de Tab
      editor.trigger("keyboard", "tab", {});
    },
  });

  // ������ Inline Completions (AI Autocomplete) ������������������������������������������������������������
  // Debounce + guard: sólo dispara si el usuario para de escribir 800ms
  let _aiDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let _aiModelLoaded = false;

  // Chequeo lazy: intentamos saber si hay modelo cargado una vez
  invoke("autocomplete_soberano", { prefix: "test", suffix: "" })
    .then(() => { _aiModelLoaded = true; })
    .catch(() => { _aiModelLoaded = false; });

  monacoInstance.languages.registerInlineCompletionsProvider("moset", {
    provideInlineCompletions: async (model: any, position: any, _ctx: any, token: any) => {
      // Si no hay modelo cargado, no intentar nada
      if (!_aiModelLoaded) return { items: [] };

      const textUntilPosition = model.getValueInRange({
        startLineNumber: Math.max(1, position.lineNumber - 20),
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const prefix = textUntilPosition.slice(-500);
      if (prefix.trim().length < 5) return { items: [] };

      const textAfterPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 10),
        endColumn: model.getLineMaxColumn(Math.min(model.getLineCount(), position.lineNumber + 10))
      });
      const suffix = textAfterPosition.slice(0, 300);

      // Debounce: esperamos 800ms de inactividad antes de consultar
      return new Promise((resolve) => {
        if (_aiDebounceTimer) clearTimeout(_aiDebounceTimer);
        _aiDebounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) { resolve({ items: [] }); return; }
          try {
            const result: string = await invoke("autocomplete_soberano", { prefix, suffix });
            if (token.isCancellationRequested) { resolve({ items: [] }); return; }
            let clean = result.replace(/<\|fim_[^>]*\|>/g, "").replace(/<\|endoftext\|>/g, "").trimEnd();
            if (!clean) { resolve({ items: [] }); return; }
            resolve({
              items: [{
                insertText: clean,
                range: new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, position.column)
              }]
            });
          } catch {
            resolve({ items: [] });
          }
        }, 800);
      });
    },
    freeInlineCompletions: () => {}
  });
}

// ������ App principal ������������������������������������������������������������������������������������������������������������������������
export default function App() {
  const [tabs, setTabs] = useState<FileTab[]>(() => {
    const saved = localStorage.getItem("moset_ide_tabs");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_TABS;
  });
  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem("moset_ide_active_tab") || "main";
  });
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [projectRoot, setProjectRoot] = useState<string | null>(() => {
    return localStorage.getItem("moset_ide_project_root") || null;
  });
  const [projectName, setProjectName] = useState<string>(() => {
    return localStorage.getItem("moset_ide_project_name") || "MOSET";
  });
  const [sidebarPanel, setSidebarPanel] = useState<string>(() => {
    return localStorage.getItem("moset_ide_sidebar_panel") || "explorer";
  });
  const [showTerminal, setShowTerminal] = useState<boolean>(() => {
    const saved = localStorage.getItem("moset_ide_show_terminal");
    return saved !== null ? saved === "true" : true;
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState<number>(() => {
    return parseInt(localStorage.getItem("moset_ide_chat_width") || "380", 10);
  });
  const [cursorPos, setCursorPos] = useState({ lineNumber: 1, column: 1 });
  const [contextPaths, setContextPaths] = useState<string[]>(() => {
    const saved = localStorage.getItem("moset_ide_context_paths");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [gitStatus, setGitStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!projectRoot || !searchQuery || searchQuery.trim() === "") {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await invoke("search_workspace", { path: projectRoot, query: searchQuery });
        setSearchResults(res as any[]);
      } catch (err) {
        console.error("Error searching:", err);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery, projectRoot]);

  useEffect(() => { localStorage.setItem("moset_ide_tabs", JSON.stringify(tabs)); }, [tabs]);
  useEffect(() => { localStorage.setItem("moset_ide_active_tab", activeTab); }, [activeTab]);
  useEffect(() => { if (projectRoot) localStorage.setItem("moset_ide_project_root", projectRoot); }, [projectRoot]);
  useEffect(() => { localStorage.setItem("moset_ide_project_name", projectName); }, [projectName]);
  useEffect(() => { localStorage.setItem("moset_ide_sidebar_panel", sidebarPanel); }, [sidebarPanel]);
  useEffect(() => { localStorage.setItem("moset_ide_show_terminal", showTerminal.toString()); }, [showTerminal]);
  useEffect(() => { localStorage.setItem("moset_ide_context_paths", JSON.stringify(contextPaths)); }, [contextPaths]);
  useEffect(() => { localStorage.setItem("moset_ide_chat_width", chatWidth.toString()); }, [chatWidth]);

  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      // e.movementX is positive dragging right, negative left.
      setChatWidth(prev => {
        let newWidth = prev + e.movementX;
        if (newWidth < 300) newWidth = 300;
        if (newWidth > 1200) newWidth = 1200;
        return newWidth;
      });
    };
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "default";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const refreshTree = useCallback(async () => {
    if (projectRoot) {
      try {
        const nodes: TreeNode[] = await invoke("read_directory", { path: projectRoot, maxDepth: 3 });
        setTree(nodes.map((n: any) => ({ ...n, open: n.type === "folder" })));
        
        try {
          const statusOutput: string = await invoke("git_status", { workspacePath: projectRoot });
          const statusMap: Record<string, string> = {};
          for (const line of statusOutput.split("\n")) {
            if (line.length < 4) continue;
            const code = line.substring(0, 2).trim() || "M";
            // porcelain string path is raw or quoted
            const filepath = line.substring(3).trim().replace(/^"|"$/g, "");
            // Absolute path heuristics (simple normalize to match Node ids)
            let abspath = projectRoot + "/" + filepath;
            abspath = abspath.replace(/\\/g, "/"); // normalize
            statusMap[abspath] = code;
          }
          setGitStatus(statusMap);
        } catch (gitErr) {
          console.warn("Git no está disponible o repositorio no inicializado", gitErr);
          setGitStatus({});
        }

      } catch (e) {
        console.error("Error auto-cargando proyecto:", e);
      }
    }
  }, [projectRoot]);

  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const activeFile = tabs.find(t => t.id === activeTab);

  // ������ Abrir carpeta de proyecto ������������������������������������������������������������������������������������������
  const openProject = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== "string") return;

      const nodes: TreeNode[] = await invoke("read_directory", { path: selected, maxDepth: 3 });
      setProjectRoot(selected);
      setProjectName(selected.replace(/\\/g, "/").split("/").pop() ?? "Proyecto");
      setTree(nodes.map(n => ({ ...n, open: n.type === "folder" })));
    } catch (e) {
      console.error("Error abriendo proyecto:", e);
    }
  }, []);

  // ������ Abrir archivo del árbol ����������������������������������������������������������������������������������������������
  const openFile = useCallback(async (node: TreeNode, fullPath: string) => {
    if (node.type === "folder") return;

    const existing = tabs.find(t => t.fullPath === fullPath || t.id === node.id);
    if (existing) { setActiveTab(existing.id); return; }

    let content = `:@ ${node.name}\n`;
    if (fullPath && projectRoot) {
      try {
        content = await invoke<string>("read_file_content", { path: fullPath });
      } catch (e) {
        console.warn("No se pudo leer el archivo:", e);
      }
    }

    const lang = getLanguage(node.name);
    const tabId = `${node.id}-${Date.now()}`;
    setTabs(prev => [...prev, {
      id: tabId,
      name: node.name,
      fullPath: fullPath ?? null,
      language: lang,
      content,
      modified: false,
    }]);
    setActiveTab(tabId);
  }, [tabs, projectRoot]);

  // ������ Cerrar tab ����������������������������������������������������������������������������������������������������������������������
  const closeTab = useCallback(async (id: string) => {
    const tabToClose = tabsRef.current.find(t => t.id === id);
    if (tabToClose && tabToClose.modified) {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const confirmed = await ask(
        `El archivo "${tabToClose.name}" tiene cambios sin guardar. ¿Seguro que quieres cerrarlo y perder los cambios?`,
        { title: "Moset IDE", kind: "warning" }
      );
      if (!confirmed) return;
    }

    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      setActiveTab(currentActive => {
        if (currentActive === id) {
          return next.length > 0 ? next[next.length - 1].id : "";
        }
        return currentActive;
      });
      return next;
    });
  }, []);

  // ������ Cambio en editor ����������������������������������������������������������������������������������������������������������
  const onEditorChange = useCallback((value: string | undefined) => {
    setTabs(prev => prev.map(t =>
      t.id === activeTab ? { ...t, content: value ?? "", modified: true } : t
    ));
  }, [activeTab]);

  // ������ Guardar archivo (Ctrl+S) ������������������������������������������������������������������������������������������
  const saveActiveFile = useCallback(async () => {
    if (!activeFile) return;
    if (!activeFile.fullPath) {
      // Archivo virtual � ofrecer guardar como (por ahora simplemente marca como guardado)
      setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, modified: false } : t));
      return;
    }
    try {
      await invoke("save_file_content", {
        path: activeFile.fullPath,
        content: activeFile.content,
      });
      setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, modified: false } : t));
    } catch (e) {
      console.error("Error guardando:", e);
    }
  }, [activeFile, activeTab]);

  // Registrar Ctrl+S a nivel ventana
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveActiveFile]);

  // ������ Validación en tiempo real (Linter) ����������������������������������������������������������������������
  useEffect(() => {
    if (!activeFile || !editorRef.current) return;
    if (activeFile.language !== "moset") return;

    const timeout = setTimeout(async () => {
      try {
        const markersRaw = await invoke("validate_code", { codigo: activeFile.content }) as Array<{linea: number, columna: number, mensaje: string, severidad: string}>;
        const markers = markersRaw.map(m => ({
          severity: m.severidad === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: m.mensaje,
          startLineNumber: m.linea,
          startColumn: m.columna,
          endLineNumber: m.linea,
          endColumn: m.columna + 10,
        }));
        const model = editorRef.current?.getModel();
        if (model) monaco.editor.setModelMarkers(model, "moset-linter", markers);
      } catch (err) {
        console.error("AST validation failed:", err);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [activeFile?.content, activeFile?.language]);

  // ������ Ejecutar código ������������������������������������������������������������������������������������������������������������
  const runMosetCode = async () => {
    if (!activeFile) return;
    setShowTerminal(true);
    try {
      const { emit } = await import("@tauri-apps/api/event");
      // Animación de inicio
      await emit("pty-read", "\r\n\x1b[1;36m[MOS-MOTOR] Iniciando secuencia de ejecución...\x1b[0m\r\n");
      await emit("pty-read", "\x1b[35m[SISTEMA] Cargando entorno Soberano...\x1b[0m\r\n");
      
      const result: string = await invoke("ejecutar", { codigo: activeFile.content });
      
      await emit("pty-read", `\r\n\x1b[1;32mOUTPUT:\x1b[0m\r\n${result}\r\n`);
      await emit("pty-read", "\x1b[36m[EXIT] Proceso finalizado con éxito.\x1b[0m\r\n");
    } catch (e: any) {
      console.error("Error ejecutando:", e);
      const { emit } = await import("@tauri-apps/api/event");
      await emit("pty-read", `\r\n\x1b[1;31m[ERROR] Fallo en la matriz:\x1b[0m\r\n\x1b[31m${e}\x1b[0m\r\n`);
    }
  };

  const activeFileLang = activeFile?.language === "moset" ? "moset" : (activeFile?.language ?? "");

  return (
    <div className="ide-root">
      <ActivityBar
        active={sidebarPanel}
        setActive={setSidebarPanel}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
      />

      {sidebarPanel && sidebarPanel !== "settings" && (
        <div className="sidebar">
          {sidebarPanel === "explorer" && (
            <Explorador
              tree={tree}
              projectRoot={projectRoot}
              projectName={projectName}
              onOpen={openFile}
              setTree={setTree}
              onOpenProject={openProject}
              refreshTree={refreshTree}
              closeTab={closeTab}
              contextPaths={contextPaths}
              setContextPaths={setContextPaths}
              gitStatus={gitStatus}
            />
          )}
          {sidebarPanel === "search" && (
            <div className="sidebar-placeholder" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="sidebar-section-title">BUSCAR</div>
              <input
                className="search-input"
                placeholder="Buscar en archivos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {isSearching && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '10px' }}>Buscando...</div>}
              <div className="search-results-container" style={{ marginTop: '10px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {searchResults.map((res: any, idx: number) => {
                  const relativePath = projectRoot ? res.file_path.replace(projectRoot + "/", "").replace(projectRoot + "\\", "") : res.file_path;
                  return (
                    <div key={idx} className="search-result-item" 
                        style={{ padding: '8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => openFile({ id: res.file_path, name: res.file_path.split(/[\\/]/).pop(), type: "file" } as TreeNode, res.file_path)}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)', wordBreak: 'break-all', marginBottom: '4px' }}>
                        {relativePath}
                      </div>
                      {res.matches.map((m: any, midx: number) => (
                        <div key={midx} style={{ fontSize: '11px', color: '#aaa', marginTop: '2px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ color: '#fff', marginRight: '4px' }}>L{m.line_number}:</span>
                          {m.line_content.trim()}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {sidebarPanel === "run" && (
            <div className="sidebar-placeholder">
              <div className="sidebar-section-title">EJECUTAR</div>
              <button className="run-btn" onClick={() => runMosetCode()}>
                &#x25B6;&#xFE0F; MOSET RUN
              </button>
            </div>
          )}
          {/* Settings se renderiza como Overlay flotante, fuera del sidebar */}
          {sidebarPanel === "extensions" && (
            <ExtensionManager />
          )}
        </div>
      )}

      <div className="editor-area">
        <div className="editor-top-bar">
          <TabBar
            tabs={tabs}
            activeId={activeTab}
            onSelect={setActiveTab}
            onClose={closeTab}
          />
          <button
            className="terminal-toggle"
            onClick={() => setShowTerminal(v => !v)}
            title="Abrir/cerrar terminal"
          >
            &#x1F5B3;&#xFE0F;
          </button>
        </div>

        <div className="editor-and-terminal">
          <div className="editor-container">
            {tabs.length === 0 ? (
              <div className="welcome-screen">
                <div className="welcome-logo-container">
                  <div className="welcome-logo-glow" />
                  <div className="welcome-logo">
                    <img src="/moset-logo.png" alt="Moset Logo" />
                  </div>
                </div>
                
                <div className="welcome-text">
                  <h1>Moset IDE</h1>
                  <p>Motor Soberano · Inteligencia Nativa</p>
                </div>

                <div className="welcome-actions">
                  <button onClick={() => {
                    setTabs([{ id: "main", name: "main.et", fullPath: null, language: "moset", content: WELCOME_CODE, modified: false }]);
                    setActiveTab("main");
                  }}>
                    <FileIcon name="main.et" size={18} /> Nuevo Script Moset
                  </button>
                  <button onClick={openProject}>
                    <FileIcon name="folder" size={18} /> Abrir Proyecto
                  </button>
                </div>
              </div>
            ) : (
              <CodeEditor
                language={activeFile?.language ?? "moset"}
                content={activeFile?.content ?? ""}
                onChange={onEditorChange}
                onMount={(editor: any, monacoInstance: any) => {
                  editorRef.current = editor;
                  setupMonaco(monacoInstance);
                  monacoInstance.editor.setTheme("moset-dark");
                  editor.onDidChangeCursorPosition((e: any) => {
                    setCursorPos({ lineNumber: e.position.lineNumber, column: e.position.column });
                  });
                }}
              />
            )}
          </div>

          {showTerminal && <TerminalComponent />}
        </div>
      </div>

      {sidebarPanel === "settings" && (
        <SettingsPanel onUpdate={refreshTree} onClose={() => setSidebarPanel("")} />
      )}

      <StatusBar
        file={activeFile?.name ?? ""}
        lang={activeFileLang}
        projectRoot={projectRoot}
        saved={!(activeFile?.modified)}
        cursorPos={cursorPos}
      />

      {chatOpen && (
        <div className="chat-overlay" style={{ width: chatWidth }}>
          <div 
            className="chat-resizer" 
            onMouseDown={() => {
              isResizingRef.current = true;
              document.body.style.cursor = "ew-resize";
            }}
          />
          <ChatPanel
            projectRoot={projectRoot}
            contextPaths={contextPaths}
            setContextPaths={setContextPaths}
            onClose={() => setChatOpen(false)}
            onOpenArtifact={(name, content) => {
              const tabId = `artifact-${Date.now()}`;
              setTabs(prev => [...prev, {
                id: tabId,
                name: name,
                fullPath: null,
                language: getLanguage(name) || "markdown",
                content: content,
                modified: true,
              }]);
              setActiveTab(tabId);
            }}
          />
        </div>
      )}
    </div>
  );
}




