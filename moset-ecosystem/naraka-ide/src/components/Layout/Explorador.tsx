import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileIcon } from "../../App";

export interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  language?: string;
  children?: TreeNode[];
  open?: boolean;
}
export function Explorador({ tree, projectRoot, projectName, onOpen, setTree, onOpenProject, refreshTree, closeTab, contextPaths, setContextPaths, gitStatus }: {
  tree: TreeNode[];
  projectRoot: string | null;
  projectName: string;
  onOpen: (node: TreeNode, fullPath: string) => void;
  setTree: React.Dispatch<React.SetStateAction<TreeNode[]>>;
  onOpenProject: () => void;
  refreshTree: () => void;
  closeTab: (id: string) => void;
  contextPaths?: string[];
  setContextPaths?: React.Dispatch<React.SetStateAction<string[]>>;
  gitStatus?: Record<string, string>;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode | null; path: string } | null>(null);
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    defaultValue: string;
    onConfirm: (val: string) => void;
    onCancel: () => void;
  } | null>(null);

  const closeMenu = () => setContextMenu(null);
  useEffect(() => {
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const askName = (title: string, defaultValue = ""): Promise<string | null> => {
    return new Promise(resolve => {
      setPromptConfig({
        title,
        defaultValue,
        onConfirm: (val: any) => { setPromptConfig(null); resolve(val); },
        onCancel: () => { setPromptConfig(null); resolve(null); },
        isOpen: true
      });
    });
  };

  const PromptModal = () => {
    const [val, setVal] = useState(promptConfig?.defaultValue || "");
    useEffect(() => { setVal(promptConfig?.defaultValue || ""); }, [promptConfig]);
    if (!promptConfig?.isOpen) return null;
    return (
      <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal-content" style={{ backgroundColor: 'var(--moset-gray-900)', border: '1px solid var(--moset-gray-700)', padding: '20px', borderRadius: '8px', minWidth: '350px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 15px 0', color: 'var(--moset-fg)', fontSize: '14px', fontWeight: 'bold' }}>{promptConfig.title}</h3>
          <input 
            autoFocus
            type="text" 
            value={val} 
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && val.trim()) promptConfig.onConfirm(val.trim());
              if (e.key === 'Escape') promptConfig.onCancel();
            }}
            style={{ width: '100%', padding: '10px', marginBottom: '20px', backgroundColor: 'var(--moset-gray-800)', border: '1px solid var(--moset-gray-700)', color: 'var(--moset-fg)', boxSizing: 'border-box', outline: 'none', borderRadius: '4px' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={(e) => { e.stopPropagation(); promptConfig.onCancel(); }} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--moset-gray-700)', color: 'var(--moset-gray-400)', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}>Cancelar</button>
            <button onClick={(e) => { e.stopPropagation(); if(val.trim()) promptConfig.onConfirm(val.trim()); }} style={{ padding: '8px 16px', background: 'var(--moset-accent)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>Aceptar</button>
          </div>
        </div>
      </div>
    );
  };
  const toggleFolder = (id: string, nodes: TreeNode[]): TreeNode[] => {
    return nodes.map(n => {
      if (n.id === id) return { ...n, open: !n.open };
      if (n.children) return { ...n, children: toggleFolder(id, n.children) };
      return n;
    });
  };

  const renderNode = (node: TreeNode, depth = 0, parentPath = ""): React.ReactNode => {
    const indent = depth * 16;
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    const fullPath = projectRoot ? `${projectRoot}/${currentPath}` : currentPath;
    const inContext = contextPaths?.includes(fullPath);
    
    // Git badge parsing
    const queryPath = fullPath.replace(/\\/g, "/");
    const statusStr = gitStatus?.[queryPath];
    let badgeEl = null;

    if (statusStr && node.type === "file") {
      let color = "#e2b93d"; // M
      let text = "M";
      if (statusStr.includes("A")) { color = "#73c991"; text = "A"; }
      else if (statusStr.includes("D")) { color = "#f14c4c"; text = "D"; }
      else if (statusStr.includes("U") || statusStr.includes("?")) { color = "#73c991"; text = "U"; }
      else if (statusStr.includes("R") || statusStr.includes("C")) { color = "#519aba"; text = "R"; }

      badgeEl = (
        <span style={{ marginLeft: "auto", marginRight: "8px", color, fontSize: "11px", fontWeight: "bold" }}>
          {text}
        </span>
      );
    }

    if (node.type === "folder") {
      return (
        <div key={node.id}>
          <div
            className="tree-item tree-folder"
            style={{ paddingLeft: `${indent + 8}px`, backgroundColor: inContext ? "rgba(0,168,255,0.05)" : undefined }}
            onClick={() => setTree(prev => toggleFolder(node.id, prev))}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, node, path: fullPath });
            }}
          >
            <span className="tree-arrow">&#x1F4C2;</span>
            <span className="tree-folder-icon">
              {node.open ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  <line x1="9" y1="14" x2="15" y2="14"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              )}
            </span>
            <span>{node.name}</span>
            <button 
              className={`tree-context-btn ${inContext ? 'active' : ''}`} 
              onClick={(e) => {
                e.stopPropagation();
                if (inContext) setContextPaths?.(prev => prev.filter(p => p !== fullPath));
                else setContextPaths?.(prev => [...prev, fullPath]);
              }}
              title="Alternar contexto IA"
            >
              �x��
            </button>
          </div>
          {node.open && node.children?.map((c: any) => renderNode(c, depth + 1, currentPath))}
        </div>
      );
    }
    return (
      <div
        key={node.id}
        className="tree-item tree-file"
        style={{ paddingLeft: `${indent + 24}px`, backgroundColor: inContext ? "rgba(0,168,255,0.05)" : undefined }}
        onClick={() => onOpen(node, fullPath)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY, node, path: fullPath });
        }}
      >
        <span className="tree-file-icon"><FileIcon name={node.name} /></span>
        <span style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '6px' }}>
          {node.name}
        </span>
        {badgeEl}
        <button 
          className={`tree-context-btn ${inContext ? 'active' : ''}`} 
          onClick={(e) => {
            e.stopPropagation();
            if (inContext) setContextPaths?.(prev => prev.filter(p => p !== fullPath));
            else setContextPaths?.(prev => [...prev, fullPath]);
          }}
          title="Alternar contexto IA"
        >
          �x��
        </button>
      </div>
    );
  };

  const handleAction = async (action: string) => {
    if (!contextMenu || !projectRoot) return;
    const path = contextMenu.path;
    const isRoot = !contextMenu.node;
    const parentDir = isRoot ? projectRoot : (contextMenu.node?.type === "folder" ? path : path.substring(0, path.lastIndexOf("/")));
    const nodeName = contextMenu.node?.name || "";
    
    closeMenu();

    try {
      if (action === "create_file") {
        const name = await askName("Nombre del archivo:");
        if (name) {
          await invoke("create_file", { path: `${parentDir}/${name}` });
          refreshTree();
        }
      } else if (action === "create_folder") {
        const name = await askName("Nombre de la carpeta:");
        if (name) {
          await invoke("create_folder", { path: `${parentDir}/${name}` });
          refreshTree();
        }
      } else if (action === "rename" && contextMenu.node) {
        const newName = await askName("Nuevo nombre:", nodeName);
        if (newName && newName !== nodeName) {
          const newPath = `${path.substring(0, path.lastIndexOf("/"))}/${newName}`;
          await invoke("rename_item", { oldPath: path, newPath });
          refreshTree();
        }
      } else if (action === "delete" && contextMenu.node) {
        const { ask } = await import("@tauri-apps/plugin-dialog");
        const confirmed = await ask(`¿Seguro que deseas eliminar "${contextMenu.node.name}" permanentemente?`, { kind: "warning" });
        if (confirmed) {
          await invoke("delete_item", { path });
          if (contextMenu.node.type === "file") closeTab(contextMenu.node.id);
          refreshTree();
        }
      } else if (action === "add_context") {
        if (setContextPaths) setContextPaths(prev => [...prev.filter(p => p !== path), path]);
      } else if (action === "remove_context") {
        if (setContextPaths) setContextPaths(prev => prev.filter(p => p !== path));
      }
    } catch (e) {
      console.error("Action error:", e);
      alert(`Error: ${e}`);
    }
  };

  return (
    <div className="file-tree">
      <div className="sidebar-section-title">EXPLORADOR</div>

      {/* Project header */}
      <div className="sidebar-project-header">
        <div className="sidebar-project-title">
          <span className="tree-arrow">��</span>
          <span className="project-name">{projectName}</span>
        </div>
        {projectRoot && (
          <button 
            className={`tree-context-btn ${contextPaths?.includes(projectRoot) ? 'active' : ''}`} 
            onClick={(e) => {
              e.stopPropagation();
              if (contextPaths?.includes(projectRoot)) setContextPaths?.(prev => prev.filter(p => p !== projectRoot));
              else setContextPaths?.(prev => [...(prev || []), projectRoot]);
            }}
            title="Alternar contexto IA para todo el proyecto"
            style={{ marginLeft: "auto", marginRight: "5px" }}
          >
            &#x1F9E0;
          </button>
        )}
        {projectRoot && (
          <button
            className="open-project-btn"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await invoke("git_auto_sync", { workspacePath: projectRoot });
                refreshTree();
                const { message } = await import("@tauri-apps/plugin-dialog");
                await message("Sincronización Git completada con éxito.", { title: "Git Auto-Sync", kind: "info" });
              } catch (err: any) {
                const { message } = await import("@tauri-apps/plugin-dialog");
                await message(`Error en Git Auto-Sync: ${err}`, { title: "Git Error", kind: "error" });
              }
            }}
            title="Auto-Sync con Git (Add, Commit, Push)"
            style={{ marginLeft: "5px" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12a10 10 0 1 0 10-10"></path>
              <polyline points="12 2 12 12 16 16"></polyline>
            </svg>
          </button>
        )}
        <button
          className="open-project-btn"
          onClick={onOpenProject}
          title="Abrir carpeta de proyecto"
          style={{ marginLeft: "5px" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>

      {tree.length === 0 ? (
        <div className="sidebar-empty" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '200px', padding: '30px 20px', textAlign: 'center', color: 'var(--text-2)'
        }}>
          <svg style={{ opacity: 0.3, marginBottom: '16px' }} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)', margin: '0 0 8px 0' }}>Sin proyecto abierto</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '0 0 24px 0', lineHeight: 1.4 }}>
            Abre una carpeta local para explorar y editar archivos en Moset IDE.
          </p>
          <button 
            className="btn-open-folder" 
            onClick={onOpenProject}
            style={{
               background: 'var(--accent)',
               color: '#fff',
               border: 'none',
               padding: '8px 16px',
               borderRadius: '6px',
               fontSize: '12px',
               fontWeight: 500,
               cursor: 'pointer',
               display: 'flex',
               alignItems: 'center',
               gap: '8px',
               transition: 'all 0.2s',
               boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
            onMouseOut={e => e.currentTarget.style.filter = 'none'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <line x1="12" y1="5" x2="12" y2="19"></line>
               <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Abrir carpeta
          </button>
        </div>
      ) : (
        <div onContextMenu={(e) => {
          e.preventDefault();
          if (projectRoot) setContextMenu({ x: e.clientX, y: e.clientY, node: null, path: projectRoot });
        }} style={{ flex: 1 }}>
          {tree.map(n => renderNode(n))}
        </div>
      )}

      {contextMenu && (
        <div style={{
          position: "fixed",
          top: contextMenu.y,
          left: contextMenu.x,
          background: "#181B2A",
          border: "1px solid #3D4A6B",
          borderRadius: "4px",
          padding: "4px 0",
          zIndex: 10000,
          boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
          color: "#DCE4F5",
          fontSize: "13px",
          minWidth: "150px"
        }}>
          <div onClick={(e) => { e.stopPropagation(); handleAction("create_file"); }} style={{ padding: "6px 12px", cursor: "pointer" }} onMouseOver={e => e.currentTarget.style.background = "#00A8FF22"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>Nuevo Archivo</div>
          <div onClick={(e) => { e.stopPropagation(); handleAction("create_folder"); }} style={{ padding: "6px 12px", cursor: "pointer" }} onMouseOver={e => e.currentTarget.style.background = "#00A8FF22"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>Nueva Carpeta</div>
          
          <div style={{ height: "1px", background: "#3D4A6B", margin: "4px 0" }} />
          {contextPaths?.includes(contextMenu.path) ? (
            <div onClick={(e) => { e.stopPropagation(); handleAction("remove_context"); }} style={{ padding: "6px 12px", cursor: "pointer" }} onMouseOver={e => e.currentTarget.style.background = "#00A8FF22"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>Quitar del Contexto IA</div>
          ) : (
            <div onClick={(e) => { e.stopPropagation(); handleAction("add_context"); }} style={{ padding: "6px 12px", cursor: "pointer" }} onMouseOver={e => e.currentTarget.style.background = "#00A8FF22"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>Añadir al Contexto IA</div>
          )}

          {contextMenu.node && (
            <>
              <div style={{ height: "1px", background: "#3D4A6B", margin: "4px 0" }} />
              <div onClick={(e) => { e.stopPropagation(); handleAction("rename"); }} style={{ padding: "6px 12px", cursor: "pointer" }} onMouseOver={e => e.currentTarget.style.background = "#00A8FF22"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>Renombrar</div>
              <div onClick={(e) => { e.stopPropagation(); handleAction("delete"); }} style={{ padding: "6px 12px", cursor: "pointer", color: "#FF5C5C" }} onMouseOver={e => e.currentTarget.style.background = "#FF5C5C22"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>Eliminar</div>
            </>
          )}
        </div>
      )}

      <PromptModal />
    </div>
  );
}


