import { useState, useRef, useCallback, useEffect } from "react";
import { Monaco, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Explorador } from "./components/Layout/Explorador";
import { useIdeConfig } from "./hooks/useIdeConfig";
import { useFileDrop } from "./hooks/useFileDrop";
import { CodeEditor } from "./components/Editor/CodeEditor";
import { ActivityBar } from "./components/Layout/ActivityBar";

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
  if (name === "folder") return iconWorkspace;
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

// Import SettingsPanel dynamically or direct import
import { SettingsPanel } from "./components/Layout/SettingsPanel";


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
  const [chatIsFloating, setChatIsFloating] = useState<boolean>(() => {
    return localStorage.getItem("moset_ide_chat_floating") === "true";
  });
  const [chatPos, setChatPos] = useState<{x: number, y: number}>(() => {
    const saved = localStorage.getItem("moset_ide_chat_pos");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return { x: window.innerWidth - 420, y: 60 };
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

  // Persistencia de estados generales se maneja al final de los efectos
  useEffect(() => {
    localStorage.setItem('chatIsFloating', JSON.stringify(chatIsFloating));
  }, [chatIsFloating]);

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
  useEffect(() => { localStorage.setItem("moset_ide_active_tab", activeTab); }, [activeTab]);
  useEffect(() => { if (projectRoot) localStorage.setItem("moset_ide_project_root", projectRoot); }, [projectRoot]);
  useEffect(() => { localStorage.setItem("moset_ide_project_name", projectName); }, [projectName]);
  useEffect(() => { localStorage.setItem("moset_ide_sidebar_panel", sidebarPanel); }, [sidebarPanel]);
  useEffect(() => { localStorage.setItem("moset_ide_show_terminal", showTerminal.toString()); }, [showTerminal]);
  useEffect(() => { localStorage.setItem("moset_ide_context_paths", JSON.stringify(contextPaths)); }, [contextPaths]);
  useEffect(() => { localStorage.setItem("moset_ide_chat_width", chatWidth.toString()); }, [chatWidth]);
  useEffect(() => { localStorage.setItem("moset_ide_chat_floating", chatIsFloating.toString()); }, [chatIsFloating]);
  useEffect(() => {
    localStorage.setItem("moset_ide_chat_pos", JSON.stringify(chatPos));
  }, [chatPos]);


  const isResizingRef = useRef(false);
  const isDraggingChatRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingRef.current) {
        // En modo flotante o acoplado, modificamos width
        // Si está acoplado a la derecha, e.movementX negativo aumenta el ancho, pero
        // vamos a mantener el comportamiento antiguo.
        setChatWidth(prev => {
          let newWidth = prev + e.movementX;
          if (newWidth < 300) newWidth = 300;
          if (newWidth > 1200) newWidth = 1200;
          return newWidth;
        });
      } else if (isDraggingChatRef.current) {
        setChatPos({
          x: e.clientX - dragOffsetRef.current.x,
          y: e.clientY - dragOffsetRef.current.y
        });
      }
    };
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "default";
      }
      if (isDraggingChatRef.current) {
        isDraggingChatRef.current = false;
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
        <div 
          className={`chat-overlay ${chatIsFloating ? 'floating' : 'docked'}`} 
          style={{ 
            width: chatWidth,
            height: chatIsFloating ? '75vh' : undefined, /* Altura fija en modo flotante para no contraerse */
            left: chatIsFloating ? chatPos.x : 'var(--activity-w)',
            top: chatIsFloating ? chatPos.y : 0,
            bottom: chatIsFloating ? undefined : 0, /* Cuando dockeado llega hasta abajo */
            right: chatIsFloating ? undefined : undefined,
          }}
        >
          <div 
            className="chat-resizer" 
            style={{ 
              right: chatIsFloating ? undefined : 0, /* Resizer a la der si está anclado a la izquierda */
              left: chatIsFloating ? 0 : undefined /* Resizer a la izq si está flotando */
            }}
            onMouseDown={(e) => {
              isResizingRef.current = true;
              document.body.style.cursor = "ew-resize";
              e.preventDefault();
            }}
          />
          <ChatPanel
            projectRoot={projectRoot}
            contextPaths={contextPaths}
            setContextPaths={setContextPaths}
            onClose={() => setChatOpen(false)}
            isFloating={false} // Siempre anclado
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
    </div>
  );
}




