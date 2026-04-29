import { useState, useRef, useCallback, useEffect, Fragment, useMemo } from "react";
import { Monaco, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Explorador } from "./components/Layout/Explorador";
import { useIdeConfig } from "./hooks/useIdeConfig";
import { useFileDrop } from "./hooks/useFileDrop";
import { useFloatingWindow } from "./hooks/useFloatingWindow";
import { CodeEditor } from "./components/Editor/CodeEditor";
import { LensMenuPopup } from "./components/Editor/LensMenuPopup";
import { ActivityBar } from "./components/Layout/ActivityBar";

import ChatPanel from "./ChatPanel";
import { MosetOutputPanel, type MosetOutput } from "./components/MosetOutputPanel";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SoberanaTerminal } from "./components/Terminal/SoberanaTerminal";
import "./styles/index.css";

import { FileTab, TreeNode, getLanguage } from "./utils/fileTypes";
import { FileIcon, getIconSrc } from "./utils/iconMap";
import { ExtensionManager } from "./components/Layout/ExtensionManager";
import { useWorkspace } from "./hooks/useWorkspace";
import { setupMonaco } from "./utils/monacoSetup";

import { WELCOME_CODE } from "./utils/constants";
import { PanelHeader } from "./components/Layout/PanelHeader";
import { SettingsPanel } from "./components/Layout/SettingsPanel";
import { GGUFPanel } from "./components/Layout/GGUFPanel";
import { UastPanel } from "./components/Layout/UastPanel";
import { GGUFEditorTab } from "./components/Editor/GGUFEditorTab";
import { TabBar } from "./components/Layout/TabBar";
import { StatusBar } from "./components/Layout/StatusBar";

// Configurar Monaco para usar la instancia local (offline)
loader.config({ monaco });
setupMonaco(monaco);


// ─── App principal ──────────────────────────────────────────────────────────
const PANEL_ORDER = ["explorer", "search", "run", "settings", "extensions", "gguf", "uast"];

export default function App() {
  const ideConfig = useIdeConfig();
  const [showLensMenu, setShowLensMenu] = useState(false);
  const { tabs, activeTab, setTabs, setActiveTab, addTab, removeTab, updateTabContent } = useWorkspace();

  const tabsRef = useRef(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [projectRoot, setProjectRoot] = useState<string | null>(() => {
    return localStorage.getItem("moset_ide_project_root") || null;
  });
  const [projectName, setProjectName] = useState<string>(() => {
    return localStorage.getItem("moset_ide_project_name") || "MOSET";
  });
  // ─── Multi-Panel Sidebar ──────────────────────────────────────
  const [openPanels, setOpenPanels] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("moset_ide_open_panels");
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(["explorer"]);
  });
  const togglePanel = useCallback((id: string) => {
    setOpenPanels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const orderedOpenPanels = useMemo(() => PANEL_ORDER.filter(p => openPanels.has(p)), [openPanels]);

  // ─── Floating Panels ──────────────────────────────────────────
  const [floatingPanels, setFloatingPanels] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("moset_ide_floating_panels");
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set();
  });
  useEffect(() => {
    localStorage.setItem("moset_ide_floating_panels", JSON.stringify([...floatingPanels]));
  }, [floatingPanels]);

  const [floatingGeo, setFloatingGeo] = useState<Record<string, { x: number; y: number; w: number; h: number }>>(() => {
    try {
      const saved = localStorage.getItem("moset_ide_floating_geo");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  useEffect(() => {
    localStorage.setItem("moset_ide_floating_geo", JSON.stringify(floatingGeo));
  }, [floatingGeo]);

  const getFloatingGeo = (id: string) => floatingGeo[id] || { x: 200 + PANEL_ORDER.indexOf(id) * 30, y: 80 + PANEL_ORDER.indexOf(id) * 30, w: 340, h: 500 };

  const toggleFloatingPanel = useCallback((id: string) => {
    setFloatingPanels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Drag & resize refs for floating panels
  const floatDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const floatResizeRef = useRef<string | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (floatDragRef.current) {
        const { id, offsetX, offsetY } = floatDragRef.current;
        setFloatingGeo(prev => {
          const geo = prev[id] || { x: 200, y: 80, w: 340, h: 500 };
          return { ...prev, [id]: { ...geo, x: Math.max(0, e.clientX - offsetX), y: Math.max(0, e.clientY - offsetY) } };
        });
      }
      if (floatResizeRef.current) {
        const id = floatResizeRef.current;
        setFloatingGeo(prev => {
          const geo = prev[id] || { x: 200, y: 80, w: 340, h: 500 };
          return { ...prev, [id]: { ...geo, w: Math.max(260, geo.w + e.movementX), h: Math.max(200, geo.h + e.movementY) } };
        });
      }
    };
    const onUp = () => {
      if (floatDragRef.current) {
        floatDragRef.current = null;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
      }
      if (floatResizeRef.current) {
        floatResizeRef.current = null;
        document.body.style.cursor = "default";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const onFloatDragStart = useCallback((id: string, e: React.MouseEvent) => {
    const geo = getFloatingGeo(id);
    floatDragRef.current = { id, offsetX: e.clientX - geo.x, offsetY: e.clientY - geo.y };
    document.body.style.userSelect = "none";
  }, [floatingGeo]);

  const onFloatResizeStart = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    floatResizeRef.current = id;
    document.body.style.cursor = "nwse-resize";
  }, []);

  // Split panels: docked go in sidebar, floating go in overlay
  const dockedPanels = useMemo(() => orderedOpenPanels.filter(p => !floatingPanels.has(p)), [orderedOpenPanels, floatingPanels]);
  const floatingOpenPanels = useMemo(() => orderedOpenPanels.filter(p => floatingPanels.has(p)), [orderedOpenPanels, floatingPanels]);

  const [showTerminal, setShowTerminal] = useState<boolean>(() => {
    const saved = localStorage.getItem("moset_ide_show_terminal");
    return saved !== null ? saved === "true" : true;
  });
  const [chatOpen, setChatOpen] = useState(false);

  // ─── Per-Panel Widths (resizable) ──────────────────────────────────
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("moset_ide_panel_widths");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const getPanelWidth = (id: string) => {
    const raw = panelWidths[id] || 260;
    const maxSafeWidth = (window.innerWidth - 48) / Math.max(1, orderedOpenPanels.length);
    return Math.max(180, Math.min(raw, maxSafeWidth));
  };
  const resizingPanelRef = useRef<string | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWRef = useRef(0);
  useEffect(() => {
    localStorage.setItem("moset_ide_panel_widths", JSON.stringify(panelWidths));
  }, [panelWidths]);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const panelId = resizingPanelRef.current;
      if (!panelId) return;
      const delta = e.clientX - resizeStartXRef.current;
      const newW = Math.max(180, Math.min(resizeStartWRef.current + delta, 600));
      setPanelWidths(prev => ({ ...prev, [panelId]: newW }));
    };
    const onUp = () => {
      if (resizingPanelRef.current) {
        resizingPanelRef.current = null;
        document.body.style.cursor = "default";
        document.body.style.userSelect = "auto";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  const [mosetPanelOpen, setMosetPanelOpen] = useState(false);
  const [mosetOutput, setMosetOutput] = useState<MosetOutput | null>(null);
  const [mosetError, setMosetError] = useState<string | null>(null);
  const [mosetRunning, setMosetRunning] = useState(false);
  const {
    width: chatWidth,
    height: chatHeight,
    pos: chatPos,
    isFloating: chatIsFloating,
    setWidth: setChatWidth,
    setIsFloating: setChatIsFloating,
    onDragStart: onChatDragStart,
    startResizing: startChatResizing,
    startResizingFloating: startChatResizingFloating,
  } = useFloatingWindow({
    storagePrefix: "moset_ide_chat",
    defaultWidth: 380,
    defaultHeight: 600,
    defaultPosX: window.innerWidth - 420,
    defaultPosY: 60,
  });

  const {
    width: editorWidth,
    height: editorHeight,
    pos: editorPos,
    isFloating: editorIsFloating,
    setIsFloating: setEditorIsFloating,
    onDragStart: onEditorDragStart,
    startResizingFloating: startEditorResizingFloating,
  } = useFloatingWindow({
    storagePrefix: "moset_ide_editor",
    defaultWidth: 800,
    defaultHeight: 600,
    defaultPosX: window.innerWidth / 2 - 400,
    defaultPosY: 100,
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



  // D4g: Sincronizar config del Vigilante con el backend Rust al arrancar el IDE
  useEffect(() => {
    invoke("configurar_vigilante", {
      prohibidos: localStorage.getItem("moset_vig_prohibidos") || "",
      peligrosos: localStorage.getItem("moset_vig_peligrosos") || "",
      cautelosos: localStorage.getItem("moset_vig_cautelosos") || "",
      sandboxPaths: localStorage.getItem("moset_vig_sandbox") || "",
    }).catch((e: any) => console.warn("Vigilante config startup sync failed:", e));
  }, []);

  useFileDrop((paths) => {
    // File drop handler
    if (chatOpen) {
        setContextPaths(prev => {
          const newPaths = [...prev];
          paths.forEach(p => {
            if (!newPaths.includes(p)) newPaths.push(p);
          });
          return newPaths;
        });
    }
  });

  useEffect(() => {
    if (!projectRoot || !searchQuery || searchQuery.trim() === "") {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const rawRes = await invoke("search_workspace", { path: projectRoot, query: searchQuery });
        const rawResults = rawRes as any[];
        const grouped = rawResults.reduce((acc: any, curr: any) => {
          let group = acc.find((g: any) => g.file_path === curr.file);
          if (!group) {
            group = { file_path: curr.file, matches: [] };
            acc.push(group);
          }
          group.matches.push({ line_number: curr.line, line_content: curr.content });
          return acc;
        }, []);
        setSearchResults(grouped);
      } catch (err) {
        console.error("Error searching:", err);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery, projectRoot]);

  useEffect(() => { localStorage.setItem("moset_ide_tabs", JSON.stringify(tabs)); }, [tabs]);
  useEffect(() => { if (activeTab) localStorage.setItem("moset_ide_active_tab", activeTab); }, [activeTab]);
  useEffect(() => { if (projectRoot) localStorage.setItem("moset_ide_project_root", projectRoot); }, [projectRoot]);
  useEffect(() => { localStorage.setItem("moset_ide_project_name", projectName); }, [projectName]);
  useEffect(() => { localStorage.setItem("moset_ide_open_panels", JSON.stringify([...openPanels])); }, [openPanels]);
  useEffect(() => { localStorage.setItem("moset_ide_show_terminal", showTerminal.toString()); }, [showTerminal]);
  useEffect(() => { localStorage.setItem("moset_ide_context_paths", JSON.stringify(contextPaths)); }, [contextPaths]);


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

  // ─── Refresco de Idioma (U-AST) ──────────────────────────────────────────────
  const prevLangRef = useRef(ideConfig.lensLanguage);
  useEffect(() => {
    if (prevLangRef.current !== ideConfig.lensLanguage && projectRoot) {
      const oldLang = prevLangRef.current;
      const newLang = ideConfig.lensLanguage;
      prevLangRef.current = newLang;

      const refreshTabs = async () => {
        const currentTabs = tabsRef.current;
        if (!currentTabs.some(t => t.language === "moset")) return;

        const updatedTabs = await Promise.all(currentTabs.map(async (tab) => {
          if (tab.language === "moset" && tab.fullPath) {
            try {
              let newContent = "";
              if (tab.modified) {
                const canonico = await invoke<string>("dematerializar_codigo", {
                  dirProyecto: projectRoot,
                  textoLocal: tab.content,
                  idioma: oldLang
                });
                newContent = await invoke<string>("proyectar_codigo", {
                  dirProyecto: projectRoot,
                  textoCanonico: canonico,
                  idioma: newLang
                });
              } else {
                newContent = await invoke<string>("proyectar_archivo", {
                  ruta: tab.fullPath,
                  idioma: newLang
                });
              }
              return { ...tab, content: newContent };
            } catch (e) {
              console.error(`Error reproyectando ${tab.name}:`, e);
            }
          }
          return tab;
        }));
        setTabs(updatedTabs);
      };

      refreshTabs();
    }
  }, [ideConfig.lensLanguage, projectRoot, setTabs]);


  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const activeFile = tabs.find(t => t.id === activeTab);

  // ─── Abrir carpeta de proyecto ──────────────────────────────────────────────
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

  // ─── Abrir archivo del árbol ────────────────────────────────────────────────
  const openFile = useCallback(async (node: TreeNode, fullPath: string) => {
    if (node.type === "folder") return;

    const existing = tabs.find(t => t.fullPath === fullPath || t.id === node.id);
    if (existing) { setActiveTab(existing.id); return; }

    const lang = fullPath.toLowerCase().endsWith(".gguf") ? "gguf" : getLanguage(node.name);

    let content = `:@ ${node.name}\n`;
    if (fullPath && projectRoot && lang !== "gguf") {
      try {
        if (lang === "moset") {
          content = await invoke<string>("proyectar_archivo", { ruta: fullPath, idioma: ideConfig.lensLanguage });
        } else {
          content = await invoke<string>("read_file_content", { path: fullPath });
        }
      } catch (e) {
        console.warn("No se pudo leer el archivo:", e);
      }
    } else if (lang === "gguf") {
      content = "GGUF Binary Data";
    }

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

  // ─── Cerrar tab ─────────────────────────────────────────────────────────────
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

  // --- Cambio en editor ---
  const onEditorChange = useCallback((value: string | undefined) => {
    setTabs(prev => prev.map(t =>
      t.id === activeTab ? { ...t, content: value ?? "", modified: true } : t
    ));
  }, [activeTab]);

  // --- Guardar archivo (Ctrl+S) ---
  const saveActiveFile = useCallback(async () => {
    if (!activeFile) return;
    if (!activeFile.fullPath) {
      // Archivo virtual - ofrecer guardar como (por ahora simplemente marca como guardado)
      setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, modified: false } : t));
      return;
    }
    try {
      if (activeFile.language === "moset") {
        await invoke("dematerializar_y_guardar", {
          ruta: activeFile.fullPath,
          textoLocal: activeFile.content,
          idioma: ideConfig.lensLanguage
        });
      } else {
        await invoke("save_file_content", {
          path: activeFile.fullPath,
          content: activeFile.content,
        });
      }
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

  // Manejar evento de Settings desde otras partes del sistema (e.g. ChatPanel)
  useEffect(() => {
    const handleOpenSettings = () => {
      setOpenPanels(prev => new Set([...prev, "settings"]));
    };
    window.addEventListener("open-settings", handleOpenSettings);
    return () => window.removeEventListener("open-settings", handleOpenSettings);
  }, []);

  // --- Validación en tiempo real (Linter) ---
  useEffect(() => {
    if (!activeFile || !editorRef.current) return;
    if (activeFile.language !== "moset") return;

    const timeout = setTimeout(async () => {
      try {
        const markersRaw = await invoke("validate_code", { 
          codigo: activeFile.content,
          idioma: ideConfig.useLocalizationLens ? ideConfig.lensLanguage : null
        }) as Array<{linea: number, columna: number, mensaje: string, severidad: string}>;
        const markers = markersRaw.map(m => ({
          severity: m.severidad === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: m.mensaje,
          startLineNumber: m.linea,
          startColumn: m.columna,
          endLineNumber: m.linea,
          endColumn: m.columna + Math.max(1, activeFile.content.split('\n')[m.linea - 1]?.substring(m.columna - 1).match(/^\w+/)?.[0].length || 1),
        }));
        const model = editorRef.current?.getModel();
        if (model) monaco.editor.setModelMarkers(model, "moset-linter", markers);
      } catch (err) {
        console.error("AST validation failed:", err);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [activeFile?.content, activeFile?.language]);

  // --- Ejecutar código ---
  const runMosetCode = async (explicitCode?: string, explicitName?: string, explicitLanguage?: string) => {
    const code = explicitCode ?? activeFile?.content;
    const name = explicitName ?? activeFile?.name;
    const language = explicitLanguage ?? activeFile?.language;
    
    if (!code) return;

    // Solo archivos .et abren el panel visual; otros van al terminal
    if (language !== "moset" && !name?.endsWith(".et")) {
      setShowTerminal(true);
      return;
    }

    setMosetOutput(null);
    setMosetError(null);
    setMosetRunning(true);
    setMosetPanelOpen(true);

    try {
      let codeToRun = code;
      if (language === "moset" && projectRoot) {
        codeToRun = await invoke("dematerializar_codigo", {
          dirProyecto: projectRoot,
          textoLocal: code,
          idioma: ideConfig.lensLanguage
        });
      }
      
      const result: string = await invoke("ejecutar", { codigo: codeToRun });
      const parsed: MosetOutput = JSON.parse(result);
      setMosetOutput(parsed);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : (e?.message ?? String(e));
      setMosetError(msg);
    } finally {
      setMosetRunning(false);
    }
  };

  // Listener para ejecución externa (Explorer context menu, Chat "Ejecutar")
  // Los callers siempre pasan params explícitos en detail, así que no hay closure stale.
  useEffect(() => {
    const handleRunEvent = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.codigo) return;

      // Ejecutar directamente sin depender de closure — todo viene del event
      setMosetOutput(null);
      setMosetError(null);
      setMosetRunning(true);
      setMosetPanelOpen(true);

      try {
        let codeToRun = detail.codigo;
        if (detail.language === "moset" && projectRoot) {
          codeToRun = await invoke("dematerializar_codigo", {
            dirProyecto: projectRoot,
            textoLocal: detail.codigo,
            idioma: ideConfig.lensLanguage
          });
        }
        
        const result: string = await invoke("ejecutar", { codigo: codeToRun });
        const parsed: MosetOutput = JSON.parse(result);
        setMosetOutput(parsed);
      } catch (err: any) {
        const msg = typeof err === "string" ? err : (err?.message ?? String(err));
        setMosetError(msg);
      } finally {
        setMosetRunning(false);
      }
    };
    window.addEventListener("run-moset-code", handleRunEvent);
    return () => window.removeEventListener("run-moset-code", handleRunEvent);
  }, []);

  const activeFileLang = activeFile?.language === "moset" ? "moset" : (activeFile?.language ?? "");

  return (
    <div className="ide-root">
      <div className="ide-main">
        <ActivityBar
          openPanels={openPanels}
          togglePanel={togglePanel}
          chatOpen={chatOpen}
          setChatOpen={setChatOpen}
        />

        {/* ─── Docked Sidebar Panels ───────────────────────────────── */}
      {dockedPanels.map(panelId => (
        <Fragment key={panelId}>
          <div className="sidebar" style={{ width: getPanelWidth(panelId) }}>
            {panelId === "explorer" && (
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
                floatButton={<button className="panel-header-float-btn" onClick={() => toggleFloatingPanel("explorer")} title="Hacer flotante" style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '12px' }}>🗗</button>}
              />
            )}
            {panelId === "search" && (
              <div className="sidebar-placeholder" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <PanelHeader title="BUSCAR" onClose={() => togglePanel('search')} isFloating={false} onToggleFloating={() => toggleFloatingPanel('search')} />
                <input
                  className="search-input"
                  placeholder="Buscar en archivos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {isSearching && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '10px' }}>Buscando...</div>}
                <div className="search-results-container" style={{ marginTop: '10px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {Array.isArray(searchResults) && searchResults.map((res: any, idx: number) => {
                    if (!res) return null;
                    const relativePath = projectRoot && typeof res.file_path === 'string' ? res.file_path.replace(projectRoot + "/", "").replace(projectRoot + "\\", "") : res.file_path;
                    return (
                      <div key={idx} className="search-result-item" 
                          style={{ padding: '8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                          onClick={() => openFile({ id: res.file_path, name: String(res.file_path).split(/[\\/]/).pop() || '', type: "file" } as TreeNode, res.file_path)}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)', wordBreak: 'break-all', marginBottom: '4px' }}>
                          {relativePath}
                        </div>
                        {Array.isArray(res.matches) && res.matches.map((m: any, midx: number) => (
                          <div key={midx} style={{ fontSize: '11px', color: '#aaa', marginTop: '2px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ color: '#fff', marginRight: '4px' }}>L{m?.line_number}:</span>
                            {m?.line_content?.trim()}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {panelId === "run" && (
              <div className="sidebar-placeholder">
                <PanelHeader title="EJECUTAR" onClose={() => togglePanel('run')} isFloating={false} onToggleFloating={() => toggleFloatingPanel('run')} />
                <button className="run-btn" onClick={() => runMosetCode()}>
                  &#x25B6;&#xFE0F; MOSET RUN
                </button>
              </div>
            )}
            {panelId === "settings" && (
              <SettingsPanel onUpdate={refreshTree} onClose={() => togglePanel("settings")} isFloating={false} onToggleFloating={() => toggleFloatingPanel("settings")} />
            )}
            {panelId === "extensions" && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <PanelHeader title="EXTENSIONES" onClose={() => togglePanel('extensions')} isFloating={false} onToggleFloating={() => toggleFloatingPanel('extensions')} />
                <ExtensionManager />
              </div>
            )}
            {panelId === "gguf" && (
              <GGUFPanel 
                onClose={() => togglePanel("gguf")} 
                onOpenEditor={(filePath) => {
                  const node = { id: filePath, name: filePath.split(/[\\/]/).pop() || "", type: "file" } as TreeNode;
                  openFile(node, filePath);
                }}
                isFloating={false}
                onToggleFloating={() => toggleFloatingPanel("gguf")}
              />
            )}
            {panelId === "uast" && (
              <UastPanel 
                onClose={() => togglePanel("uast")} 
                projectRoot={projectRoot}
                isFloating={false}
                onToggleFloating={() => toggleFloatingPanel("uast")}
              />
            )}
          </div>
          <div
            className="sidebar-resizer"
            onMouseDown={(e) => {
              e.preventDefault();
              resizingPanelRef.current = panelId;
              resizeStartXRef.current = e.clientX;
              resizeStartWRef.current = getPanelWidth(panelId);
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
          />
        </Fragment>
      ))}

      {/* ─── Floating Panel Overlays ───────────────────────────────── */}
      {floatingOpenPanels.map(panelId => {
        const geo = getFloatingGeo(panelId);
        return (
          <div key={`float-${panelId}`} className="floating-panel-wrapper" style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h }}>
            <div className="floating-panel-dragbar" onMouseDown={(e) => onFloatDragStart(panelId, e)}>
              <span style={{ opacity: 0.4, fontSize: '10px', letterSpacing: '2px' }}>⠿ {panelId.toUpperCase()}</span>
            </div>
            <div className="sidebar" style={{ width: '100%', flex: 1 }}>
              {panelId === "explorer" && (
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
                  floatButton={<button className="panel-header-float-btn" onClick={() => toggleFloatingPanel("explorer")} title="Acoplar panel" style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '12px' }}>⬅</button>}
                />
              )}
              {panelId === "search" && (
                <div className="sidebar-placeholder" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <PanelHeader title="BUSCAR" onClose={() => togglePanel('search')} isFloating={true} onToggleFloating={() => toggleFloatingPanel('search')} onDragStart={(e) => onFloatDragStart('search', e)} />
                  <input className="search-input" placeholder="Buscar en archivos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  {isSearching && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '10px' }}>Buscando...</div>}
                  <div className="search-results-container" style={{ marginTop: '10px', overflowY: 'auto', flex: 1 }}>
                    {Array.isArray(searchResults) && searchResults.map((res: any, idx: number) => {
                      if (!res) return null;
                      const relativePath = projectRoot && typeof res.file_path === 'string' ? res.file_path.replace(projectRoot + "/", "").replace(projectRoot + "\\", "") : res.file_path;
                      return (
                        <div key={idx} className="search-result-item" style={{ padding: '8px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => openFile({ id: res.file_path, name: String(res.file_path).split(/[\\/]/).pop() || '', type: "file" } as TreeNode, res.file_path)}>
                          <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)', wordBreak: 'break-all', marginBottom: '4px' }}>{relativePath}</div>
                          {Array.isArray(res.matches) && res.matches.map((m: any, midx: number) => (
                            <div key={midx} style={{ fontSize: '11px', color: '#aaa', marginTop: '2px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              <span style={{ color: '#fff', marginRight: '4px' }}>L{m?.line_number}:</span>{m?.line_content?.trim()}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {panelId === "run" && (
                <div className="sidebar-placeholder">
                  <PanelHeader title="EJECUTAR" onClose={() => togglePanel('run')} isFloating={true} onToggleFloating={() => toggleFloatingPanel('run')} onDragStart={(e) => onFloatDragStart('run', e)} />
                  <button className="run-btn" onClick={() => runMosetCode()}>&#x25B6;&#xFE0F; MOSET RUN</button>
                </div>
              )}
              {panelId === "settings" && (
                <SettingsPanel onUpdate={refreshTree} onClose={() => togglePanel("settings")} isFloating={true} onToggleFloating={() => toggleFloatingPanel("settings")} />
              )}
              {panelId === "extensions" && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <PanelHeader title="EXTENSIONES" onClose={() => togglePanel('extensions')} isFloating={true} onToggleFloating={() => toggleFloatingPanel('extensions')} onDragStart={(e) => onFloatDragStart('extensions', e)} />
                  <ExtensionManager />
                </div>
              )}
              {panelId === "gguf" && (
                <GGUFPanel 
                  onClose={() => togglePanel("gguf")} 
                  onOpenEditor={(filePath) => {
                    const node = { id: filePath, name: filePath.split(/[\\/]/).pop() || "", type: "file" } as TreeNode;
                    openFile(node, filePath);
                  }} 
                  isFloating={true}
                  onToggleFloating={() => toggleFloatingPanel("gguf")}
                />
              )}
              {panelId === "uast" && (
                <UastPanel 
                  onClose={() => togglePanel("uast")} 
                  projectRoot={projectRoot}
                  isFloating={true}
                  onToggleFloating={() => toggleFloatingPanel("uast")}
                  onOpenFolder={openProject}
                />
              )}
            </div>
            {/* Resize handle */}
            <div className="floating-panel-resizer" onMouseDown={(e) => onFloatResizeStart(panelId, e)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" style={{width: '100%', height: '100%'}}>
                <path d="M21 15l-6 6" /><path d="M21 8l-13 13" />
              </svg>
            </div>
          </div>
        );
      })}

      {chatOpen && (
        <div 
          className={`chat-overlay ${chatIsFloating ? 'floating' : 'docked'}`} 
          style={chatIsFloating ? { 
            width: chatWidth,
            height: chatHeight,
            left: chatPos.x,
            top: chatPos.y,
            position: 'absolute',
            zIndex: 100,
            overflow: 'hidden'
          } : {
            width: chatWidth,
            height: '100%'
          }}
        >
          {chatIsFloating && (
            <div 
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 15,
                height: 15,
                cursor: 'nwse-resize',
                zIndex: 1000
              }}
              onMouseDown={startChatResizingFloating}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" style={{width: '100%', height: '100%'}}>
                <path d="M21 15l-6 6" />
                <path d="M21 8l-13 13" />
              </svg>
            </div>
          )}
          {!chatIsFloating && (
            <div 
              className="chat-resizer" 
              onMouseDown={startChatResizing} 
              style={{ right: 0, left: 'auto', cursor: 'ew-resize' }}
            />
          )}
          <ChatPanel 
            projectRoot={projectRoot} 
            contextPaths={contextPaths} 
            setContextPaths={setContextPaths} 
            onClose={() => setChatOpen(false)}
            isFloating={chatIsFloating}
            onToggleFloating={() => setChatIsFloating(!chatIsFloating)}
            onDragStart={onChatDragStart}
            onOpenArtifact={(name: string, content: string) => {
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

      <div 
        className={`editor-area ${editorIsFloating ? 'floating' : 'docked'}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/moset-path") || e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();

          const internalPath = e.dataTransfer.getData("application/moset-path");
          const externalFiles = Array.from(e.dataTransfer.files);
          
          if (internalPath) {
            const filename = internalPath.split(/[/\\]/).pop() || "";
            openFile({ id: internalPath, name: filename, type: "file" } as any, internalPath);
          } else {
            externalFiles.forEach((file: any) => {
              if (file.path) {
                const filename = file.name || file.path.split(/[/\\]/).pop() || "";
                openFile({ id: file.path, name: filename, type: "file" } as any, file.path);
              }
            });
          }
        }}
        style={editorIsFloating ? {
          width: editorWidth,
          height: editorHeight,
          left: editorPos.x,
          top: editorPos.y,
          position: 'absolute',
          zIndex: 100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        } : {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          minWidth: 0
        }}
      >
        <div 
          className="editor-top-bar"
          onMouseDown={editorIsFloating ? onEditorDragStart : undefined}
          style={editorIsFloating ? { cursor: 'move' } : undefined}
        >
          <TabBar
            tabs={tabs}
            activeId={activeTab}
            onSelect={setActiveTab}
            onClose={closeTab}
          />
          <div style={{ position: 'relative' }}>
            <button
              className="terminal-toggle"
              onClick={() => setShowLensMenu(!showLensMenu)}
              title="Lente de Traducción Universal (UAST)"
              style={{
                color: ideConfig.useLocalizationLens ? 'var(--moset-sol)' : 'inherit',
                opacity: ideConfig.useLocalizationLens ? 1 : 0.6,
                marginRight: '8px',
                fontSize: '1.1em'
              }}
            >
              &#x1F50D;
            </button>
            
            {showLensMenu && (
              <LensMenuPopup ideConfig={ideConfig} onClose={() => setShowLensMenu(false)} />
            )}
          </div>
          <button
            className="terminal-toggle"
            onClick={saveActiveFile}
            title="Guardar archivo (Ctrl+S)"
            style={{
              opacity: activeFile?.modified ? 1 : 0.6,
              color: activeFile?.modified ? 'var(--accent)' : 'inherit',
              marginRight: '8px'
            }}
          >
            &#x1F4BE;
          </button>
          <button
            className="terminal-toggle"
            onClick={() => setEditorIsFloating(v => !v)}
            title={editorIsFloating ? "Acoplar editor" : "Desacoplar en ventana flotante"}
            style={{ marginRight: '8px' }}
          >
            &#x1F5D4;&#xFE0F;
          </button>
          <button
            className="terminal-toggle"
            onClick={() => setChatIsFloating(v => !v)}
            title={chatIsFloating ? "Acoplar panel lateral" : "Extraer ventana flotante"}
          >
            &#x1F5D7;&#xFE0F;
          </button>
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
                    <FileIcon name="main.et" size={16} /> Nuevo Script Moset
                  </button>
                  <button onClick={openProject}>
                    <FileIcon name="folder" size={16} /> Abrir Proyecto
                  </button>
                </div>
              </div>
            ) : activeFile?.language === "gguf" ? (
              <GGUFEditorTab filePath={activeFile.fullPath} />
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

          {showTerminal && <SoberanaTerminal />}
        </div>
        
        {editorIsFloating && (
          <div 
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 15,
              height: 15,
              cursor: 'nwse-resize',
              zIndex: 1000
            }}
            onMouseDown={startEditorResizingFloating}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" style={{width: '100%', height: '100%'}}>
              <path d="M21 15l-6 6" />
              <path d="M21 8l-13 13" />
            </svg>
          </div>
        )}
      </div>
      


      </div> {/* End ide-main */}

      <StatusBar
        file={activeFile?.name ?? ""}
        lang={activeFileLang}
        projectRoot={projectRoot}
        saved={!(activeFile?.modified)}
        cursorPos={cursorPos}
      />

      {mosetPanelOpen && (
        <MosetOutputPanel
          output={mosetOutput}
          error={mosetError}
          fileName={activeFile?.name ?? ""}
          isRunning={mosetRunning}
          onClose={() => setMosetPanelOpen(false)}
        />
      )}
    </div>
  );
}




