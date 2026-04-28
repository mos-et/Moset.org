import { useState, useEffect } from "react";
import { Editor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { setupMonaco } from "./utils/monacoSetup";
import { Play, Code, Terminal, BrainCircuit, FileCode2, Plus, X } from "lucide-react";
import initWasm, { MosetWasmRuntime } from "./wasm/moset_core.js";
import { ChatPanel } from "./components/ChatPanel";
import "./index.css";

interface VirtualFile {
  name: string;
  content: string;
}

// Configure Monaco Editor
loader.config({ monaco });
setupMonaco(monaco);

const WELCOME_CODE = `:@ Moset Playground — Motor WASM
:@ Lenguaje Moset v0.2 | Archivos: .et

:,] saludar(nombre):
    mostrar "Hola " + nombre + " desde el Playground Web!"

saludar("Mundo")

:@ Quantum bit — colapsa al observarse con !
x = Bit:~
si x!:
    mostrar "Cara"
sino:
    mostrar "Seca"
`;

export default function App() {
  const [files, setFiles] = useState<VirtualFile[]>(() => {
    const saved = localStorage.getItem("moset_playground_files");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [{ name: "main.et", content: WELCOME_CODE }];
  });
  const [activeFile, setActiveFile] = useState<string>("main.et");
  const [output, setOutput] = useState<string[]>(["[Sistema] Cargando motor WASM..."]);
  const [wasmReady, setWasmReady] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [runtime, setRuntime] = useState<any>(null);
  const [pendingPromise, setPendingPromise] = useState<string | null>(null);
  const [resolveValue, setResolveValue] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("moset_playground_files", JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    initWasm().then(() => {
      setWasmReady(true);
      setOutput(prev => [...prev, "[Sistema] Motor WASM conectado exitosamente."]);
    }).catch((err) => {
      setOutput(prev => [...prev, `[Error] Falla al cargar WASM: ${err}`]);
    });
  }, []);

  const processResult = (result: any) => {
    if (result.estado === "Terminado") {
      setOutput(prev => [...prev, ...result.resultado.split('\n')]);
    } else if (result.estado === "Suspendido") {
      setOutput(prev => [...prev, `[Pausado] Esperando resolución para promesa: ${result.promesa}`]);
      setPendingPromise(result.promesa);
    }
  };

  const handleRunCode = () => {
    setOutput([`> Ejecutando ${activeFile}...`]);
    setPendingPromise(null);
    setResolveValue("");
    if (!wasmReady) {
      setOutput(prev => [...prev, "[Error] El compilador WASM aún no está listo."]);
      return;
    }
    
    try {
      const codeToRun = files.find(f => f.name === activeFile)?.content || "";
      const rt = new MosetWasmRuntime(codeToRun);
      setRuntime(rt);
      const result = rt.ejecutar();
      processResult(result);
    } catch (e) {
      setOutput(prev => [...prev, `[Error Crítico]: ${e}`]);
    }
  };

  const handleResolvePromise = () => {
    if (!runtime) return;
    try {
      setOutput(prev => [...prev, `> Resolviendo con: ${resolveValue}`]);
      // JSON encode it so the Rust side can parse it correctly (e.g. string -> "string")
      const jsonVal = JSON.stringify(resolveValue);
      const result = runtime.reanudar(jsonVal);
      setPendingPromise(null);
      setResolveValue("");
      processResult(result);
    } catch (e) {
      setOutput(prev => [...prev, `[Error Crítico]: ${e}`]);
    }
  };

  const [dialog, setDialog] = useState<{type: 'create' | 'delete', name?: string} | null>(null);
  const [newFileName, setNewFileName] = useState('');

  const handleCreateFile = () => {
    setNewFileName(`script${files.length}.et`);
    setDialog({ type: 'create' });
  };

  const confirmCreateFile = () => {
    const name = newFileName.trim();
    if (name && !files.some(f => f.name === name)) {
      setFiles(prev => [...prev, { name, content: "" }]);
      setActiveFile(name);
    }
    setDialog(null);
  };

  const handleDeleteFile = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (files.length <= 1) return;
    setDialog({ type: 'delete', name });
  };

  const confirmDeleteFile = () => {
    if (!dialog?.name) return;
    const name = dialog.name;
    setFiles(prev => prev.filter(f => f.name !== name));
    if (activeFile === name) {
      setActiveFile(files.find(f => f.name !== name)!.name);
    }
    setDialog(null);
  };

  const updateCurrentFile = (newContent: string) => {
    setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: newContent } : f));
  };

  return (
    <div className="h-screen w-screen bg-[#0d0d0f] text-gray-300 flex flex-col font-sans overflow-hidden">
      
      {/* Title Bar */}
      <header className="h-12 bg-[#121215] border-b border-[#2a2a30] flex items-center justify-between px-4 drag-region">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="font-semibold text-sm tracking-wide text-gray-200">Moset Playground</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRunCode}
            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded border border-indigo-500/20 transition-colors text-sm font-medium"
          >
            <Play size={14} className="fill-current" />
            <span>Ejecutar</span>
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Activity Bar (Mock) */}
        <div className="w-14 bg-[#0a0a0c] border-r border-[#1a1a20] flex flex-col items-center py-4 gap-6">
          <button className="text-indigo-400 hover:text-indigo-300 transition-colors"><Code size={22} /></button>
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`transition-colors ${showChat ? "text-indigo-400" : "text-gray-500 hover:text-gray-300"}`}
          >
            <BrainCircuit size={22} />
          </button>
        </div>

        {/* Explorer */}
        <div className="w-60 bg-[#121215] border-r border-[#1a1a20] flex flex-col">
          <div className="p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Explorador</span>
            <button onClick={handleCreateFile} className="text-gray-400 hover:text-indigo-400 transition-colors">
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {files.map(f => (
              <div 
                key={f.name}
                onClick={() => setActiveFile(f.name)}
                className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group ${activeFile === f.name ? "bg-indigo-500/10 text-indigo-300" : "text-gray-400 hover:bg-[#1a1a20]"}`}
              >
                <div className="flex items-center gap-2">
                  <FileCode2 size={16} />
                  <span className="text-sm">{f.name}</span>
                </div>
                <button 
                  onClick={(e) => handleDeleteFile(f.name, e)} 
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Editor & Terminal Area */}
        <div className="flex-1 flex flex-col bg-[#0d0d0f] min-w-0">
          
          {/* Editor Tabs */}
          <div className="flex bg-[#121215] border-b border-[#1a1a20] overflow-x-auto">
            {files.map(f => (
              <div 
                key={f.name}
                onClick={() => setActiveFile(f.name)}
                className={`flex items-center gap-2 px-4 py-2 border-t-2 cursor-pointer whitespace-nowrap ${activeFile === f.name ? "bg-[#0d0d0f] border-indigo-500 text-gray-200" : "border-transparent text-gray-500 hover:bg-[#1a1a20]"}`}
              >
                <FileCode2 size={14} className={activeFile === f.name ? "text-indigo-400" : ""} />
                <span className="text-sm">{f.name}</span>
              </div>
            ))}
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 relative">
            <Editor
              height="100%"
              language="moset"
              theme="moset-dark"
              value={files.find(f => f.name === activeFile)?.content || ""}
              onChange={(val) => updateCurrentFile(val || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                fontLigatures: true,
                padding: { top: 16 },
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                renderLineHighlight: "all",
                suggest: { preview: true },
              }}
            />
          </div>

          {/* Terminal / Output Panel */}
          <div className="h-64 bg-[#0a0a0c] border-t border-[#1a1a20] flex flex-col">
            <div className="flex items-center px-4 py-2 bg-[#121215] border-b border-[#1a1a20]">
              <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold tracking-wide uppercase">
                <Terminal size={14} />
                <span>Salida</span>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-1">
              {output.map((line, i) => (
                <div key={i} className={line.startsWith("[Error]") ? "text-red-400" : line.startsWith(">") ? "text-indigo-400" : line.startsWith("[Pausado]") ? "text-yellow-400" : "text-gray-300"}>
                  {line}
                </div>
              ))}
              {pendingPromise && (
                <div className="mt-4 p-3 bg-[#121215] border border-indigo-500/30 rounded flex items-center gap-2 animate-pulse">
                  <span className="text-yellow-400 text-sm">Resuelve promesa '{pendingPromise}':</span>
                  <input
                    type="text"
                    value={resolveValue}
                    onChange={e => setResolveValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleResolvePromise()}
                    className="flex-1 bg-[#1a1a20] border border-[#2a2a30] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="Escribe el valor y presiona Enter..."
                    autoFocus
                  />
                  <button
                    onClick={handleResolvePromise}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm transition-colors"
                  >
                    Reanudar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Chat Panel */}
        {showChat && (
          <ChatPanel onClose={() => setShowChat(false)} />
        )}

        {/* Dialogs */}
        {dialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#121214] border border-[#2a2a2f] rounded-lg p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-lg font-medium text-white mb-4">
                {dialog.type === 'create' ? 'Nuevo Archivo' : 'Eliminar Archivo'}
              </h3>
              
              {dialog.type === 'create' ? (
                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">Nombre del archivo (ej: script.et)</label>
                  <input 
                    type="text" 
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmCreateFile(); if (e.key === 'Escape') setDialog(null); }}
                    className="w-full bg-[#1e1e24] border border-[#333338] rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="mb-6 text-gray-300">
                  ¿Estás seguro de que deseas eliminar el archivo <span className="text-white font-medium">{dialog.name}</span>?
                  Esta acción no se puede deshacer.
                </div>
              )}
              
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setDialog(null)}
                  className="px-4 py-2 rounded text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={dialog.type === 'create' ? confirmCreateFile : confirmDeleteFile}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    dialog.type === 'create' 
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white' 
                      : 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
                  }`}
                >
                  {dialog.type === 'create' ? 'Crear' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
