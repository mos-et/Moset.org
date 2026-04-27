import { useState, useRef, useCallback, useEffect } from "react";
import { Monaco, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Explorador } from "./components/Layout/Explorador";
import { useIdeConfig } from "./hooks/useIdeConfig";
import { useFileDrop } from "./hooks/useFileDrop";
import { useFloatingWindow } from "./hooks/useFloatingWindow";
import { CodeEditor } from "./components/Editor/CodeEditor";
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
import { SettingsPanel } from "./components/Layout/SettingsPanel";
import { TabBar } from "./components/Layout/TabBar";
import { StatusBar } from "./components/Layout/StatusBar";

// Configurar Monaco para usar la instancia local (offline)
loader.config({ monaco });
setupMonaco(monaco);


//     App principal                                                             
export default function App() {
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
  const [sidebarPanel, setSidebarPanel] = useState<string>(() => {
    return localStorage.getItem("moset_ide_sidebar_panel") || "explorer";
  });
  const [showTerminal, setShowTerminal] = useState<boolean>(() => {
    const saved = localStorage.getItem("moset_ide_show_terminal");
    return saved !== null ? saved === "true" : true;
  });
  const [chatOpen, setChatOpen] = useState(false);
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

  const { contextMode, setContextMode } = useIdeConfig();

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
    console.log("Archivos recibidos globalmente:", paths);
    if (sidebarPanel === 'chat' || chatOpen) {
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
  useEffect(() => { if (activeTab) localStorage.setItem("moset_ide_active_tab", activeTab); }, [activeTab]);
  useEffect(() => { if (projectRoot) localStorage.setItem("moset_ide_project_root", projectRoot); }, [projectRoot]);
  useEffect(() => { localStorage.setItem("moset_ide_project_name", projectName); }, [projectName]);
  useEffect(() => { localStorage.setItem("moset_ide_sidebar_panel", sidebarPanel); }, [sidebarPanel]);
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

  // Manejar evento de Settings desde otras partes del sistema (e.g. ChatPanel)
  useEffect(() => {
    const handleOpenSettings = () => {
      setSidebarPanel("settings");
    };
    window.addEventListener("open-settings", handleOpenSettings);
    return () => window.removeEventListener("open-settings", handleOpenSettings);
  }, []);

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
      const result: string = await invoke("ejecutar", { codigo: code });
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
        const result: string = await invoke("ejecutar", { codigo: detail.codigo });
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
              style={{ left: -5, right: undefined }}
              onMouseDown={startChatResizing}
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




