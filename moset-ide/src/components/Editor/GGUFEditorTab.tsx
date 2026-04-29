import React, { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import "../../styles/components/GGUFEditorTab.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GgufKvEntry {
  key: string;
  value_type: string;
  value: any;
}

interface GGUFEditorTabProps {
  filePath: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categorize(entries: GgufKvEntry[]): Record<string, GgufKvEntry[]> {
  const cats: Record<string, GgufKvEntry[]> = {};
  for (const e of entries) {
    const prefix = e.key.split(".").slice(0, -1).join(".") || "root";
    if (!cats[prefix]) cats[prefix] = [];
    cats[prefix].push(e);
  }
  return cats;
}

function getValueClass(type: string): string {
  if (type === "string") return "string";
  if (type === "bool") return "bool";
  if (type === "array") return "array";
  return "number";
}

function formatValue(entry: GgufKvEntry): string {
  if (entry.value === null || entry.value === undefined) return "null";
  if (typeof entry.value === "boolean") return entry.value ? "true" : "false";
  if (typeof entry.value === "string") {
    if (entry.value.length > 200) return entry.value.substring(0, 200) + "…";
    return entry.value;
  }
  if (Array.isArray(entry.value)) {
    if (entry.value.length > 20) return `[${entry.value.length} items]`;
    return JSON.stringify(entry.value);
  }
  return String(entry.value);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GGUFEditorTab({ filePath }: GGUFEditorTabProps) {
  const [entries, setEntries] = useState<GgufKvEntry[]>([]);
  const [editedEntries, setEditedEntries] = useState<GgufKvEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "loading" | "success" | "error"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "templates">("editor");
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editModes, setEditModes] = useState<Record<string, boolean>>({});
  const [expandedArrays, setExpandedArrays] = useState<Record<string, number>>({});
  
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newType, setNewType] = useState("string");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("gguf-ui-inject", (event: any) => {
      const { key, value_type, value } = event.payload;
      setEditedEntries(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(e => e.key === key);
        if (idx !== -1) updated[idx] = { key, value_type, value };
        else updated.unshift({ key, value_type, value });
        return updated;
      });
      setStatus({ type: "success", msg: `Metadato '${key}' inyectado por la IA.` });
      setTimeout(() => setStatus(null), 4000);
    }).then(u => unlisten = u);
    
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const loadMetadata = useCallback(async (pathToLoad: string) => {
    if (!pathToLoad) return;
    setLoading(true);
    setStatus({ type: "loading", msg: "Leyendo metadatos GGUF..." });
    try {
      const result = await invoke<GgufKvEntry[]>("read_gguf_metadata", { path: pathToLoad });
      setEntries(result);
      setEditedEntries(JSON.parse(JSON.stringify(result)));
      setStatus({ type: "success", msg: `${result.length} metadatos cargados correctamente.` });
    } catch (e: any) {
      setStatus({ type: "error", msg: String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (filePath) {
      loadMetadata(filePath);
    }
  }, [filePath, loadMetadata]);

  // Export template
  const exportTemplate = useCallback(async () => {
    if (entries.length === 0) return;
    try {
      const savePath = await save({
        filters: [{ name: "JSON Template", extensions: ["json"] }],
        defaultPath: "gguf_template.json",
      });
      if (!savePath) return;
      setStatus({ type: "loading", msg: "Exportando plantilla..." });
      const result = await invoke<string>("save_gguf_template", {
        entries,
        outputPath: savePath,
      });
      setStatus({ type: "success", msg: result });
    } catch (e: any) {
      setStatus({ type: "error", msg: String(e) });
    }
  }, [entries]);

  // Import template
  const importTemplate = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "JSON Template", extensions: ["json"] }],
        multiple: false,
      });
      if (!selected) return;
      setStatus({ type: "loading", msg: "Importando plantilla..." });
      const result = await invoke<GgufKvEntry[]>("load_gguf_template", { path: selected });
      setEntries(result);
      setEditedEntries(JSON.parse(JSON.stringify(result)));
      setStatus({ type: "success", msg: `Plantilla cargada: ${result.length} entradas.` });
    } catch (e: any) {
      setStatus({ type: "error", msg: String(e) });
    }
  }, []);

  // Save modified entries back to GGUF
  const saveToGguf = useCallback(async () => {
    if (!filePath || editedEntries.length === 0) return;
    try {
      setStatus({ type: "loading", msg: "Inyectando metadatos en GGUF..." });
      const result = await invoke<string>("write_gguf_metadata", {
        path: filePath,
        entries: editedEntries
      });
      setStatus({ type: "success", msg: result });
      loadMetadata(filePath);
    } catch (e: any) {
      setStatus({ type: "error", msg: String(e) });
    }
  }, [filePath, editedEntries, loadMetadata]);

  const getFiltered = (list: GgufKvEntry[]) => filter
    ? list.filter(e => e.key.toLowerCase().includes(filter.toLowerCase()) || 
        String(e.value).toLowerCase().includes(filter.toLowerCase()))
    : list;

  const filteredEdited = getFiltered(editedEntries);
  const editCategories = categorize(filteredEdited);

  if (!filePath) {
    return (
      <div className="gguf-editor-tab-empty">
        <h2>No hay archivo GGUF seleccionado</h2>
        <p>Por favor, seleccione un archivo desde el panel GGUF Config o abra un archivo .gguf.</p>
      </div>
    );
  }

  return (
    <div className="gguf-editor-tab">
      <div className="gguf-editor-header">
        <div className="gguf-editor-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <h1>GGUF Config - Editor</h1>
        </div>
        <div className="gguf-editor-path">{filePath}</div>
      </div>

      <div className="gguf-editor-tabs-bar">
        <button
          className={`gguf-editor-tab-btn ${activeTab === "editor" ? "active" : ""}`}
          onClick={() => setActiveTab("editor")}
        >
          Editar Metadatos
        </button>
        <button
          className={`gguf-editor-tab-btn ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          Plantillas
        </button>
      </div>

      <div className="gguf-editor-main-content">
        {activeTab === "editor" && (
          <div className="gguf-editor-pane">
            <div className="gguf-editor-toolbar" style={{ display: 'flex', gap: '10px' }}>
              <input
                className="gguf-filter-input main-filter"
                placeholder="Filtrar metadatos para editar..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="gguf-save-btn btn-apply" onClick={() => setIsAdding(!isAdding)}>
                {isAdding ? "Cancelar" : "+ Añadir Metadato"}
              </button>
            </div>
            {isAdding && (
              <div className="gguf-add-metadata-form" style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" placeholder="Clave (ej: custom.base_instruction)" value={newKey} onChange={e => setNewKey(e.target.value)} className="gguf-editor-input main-input" style={{ flex: 1 }} />
                  <select value={newType} onChange={e => setNewType(e.target.value)} className="gguf-editor-input main-input" style={{ width: '120px' }}>
                    <option value="string">String</option>
                    <option value="int32">Int32</option>
                    <option value="float32">Float32</option>
                    <option value="bool">Boolean</option>
                  </select>
                </div>
                {newType === "string" ? (
                  <textarea placeholder="Valor (puede ser código Moset, Java, instrucciones...)" value={newValue} onChange={e => setNewValue(e.target.value)} className="gguf-editor-input main-input" style={{ minHeight: '100px', resize: 'vertical' }} />
                ) : newType === "bool" ? (
                  <select value={newValue} onChange={e => setNewValue(e.target.value)} className="gguf-editor-input main-input">
                    <option value="">Selecciona valor...</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input type="text" placeholder="Valor numérico" value={newValue} onChange={e => setNewValue(e.target.value)} className="gguf-editor-input main-input" />
                )}
                <button className="gguf-save-btn btn-apply" onClick={() => {
                  if (!newKey) return;
                  let val: any = newValue;
                  if (newType === "bool") val = newValue === "true";
                  else if (newType.startsWith("int") || newType.startsWith("float")) val = Number(newValue) || 0;
                  
                  const newEntry = { key: newKey, value_type: newType, value: val };
                  const exists = editedEntries.findIndex(e => e.key === newKey);
                  let updated = [...editedEntries];
                  if (exists !== -1) updated[exists] = newEntry;
                  else updated.push(newEntry);
                  
                  setEditedEntries(updated);
                  setNewKey(""); setNewValue(""); setIsAdding(false);
                }}>
                  Guardar en lista (Requiere aplicar al archivo luego)
                </button>
              </div>
            )}
            <div className="gguf-editor-scroll-area">
              {editedEntries.length === 0 ? (
                <div className="gguf-empty">
                  <div className="gguf-empty-icon">✏️</div>
                  <div className="gguf-empty-text">Cargando modelo...</div>
                </div>
              ) : (
                <div className="gguf-kv-list main-list">
                  {Object.entries(editCategories).map(([cat, items]) => (
                    <div className="gguf-category main-category" key={`edit-${cat}`}>
                      <div
                        className="gguf-category-header main-category-header"
                        onClick={() => setCollapsed(prev => ({ ...prev, [`edit-${cat}`]: !prev[`edit-${cat}`] }))}
                      >
                        <span className={`gguf-category-arrow ${collapsed[`edit-${cat}`] ? "" : "open"}`}>▶</span>
                        {cat}
                        <span className="gguf-category-count">{items.length}</span>
                      </div>
                      {!collapsed[`edit-${cat}`] && (
                        <div className="gguf-category-items">
                          {items.map((entry, idx) => (
                            <div className="gguf-kv-card anim-fade-in" key={`edit-${cat}-${idx}`}>
                              <div className="gguf-kv-info">
                                <div className="gguf-kv-label-row">
                                  <span className="gguf-kv-key-label">{entry.key.split(".").pop()}</span>
                                  <span className="gguf-kv-type-tag">{entry.value_type}</span>
                                </div>
                                <div className="gguf-kv-full-key">{entry.key}</div>
                              </div>
                              
                              <div className="gguf-kv-value-editor">
                                {entry.value_type === "string" ? (
                                  <textarea
                                    className="gguf-editor-input premium-input"
                                    value={entry.value === null ? "" : entry.value}
                                    onChange={e => {
                                      const newEntries = [...editedEntries];
                                      const i = newEntries.findIndex(x => x.key === entry.key);
                                      if (i !== -1) {
                                        newEntries[i].value = e.target.value;
                                        setEditedEntries(newEntries);
                                      }
                                    }}
                                    rows={1}
                                    onInput={(e: any) => {
                                      e.target.style.height = 'auto';
                                      e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                  />
                                ) : entry.value_type.startsWith("int") || entry.value_type.startsWith("float") || entry.value_type.startsWith("uint") ? (
                                  <input
                                    className="gguf-editor-input premium-input"
                                    type="number"
                                    step={entry.value_type.includes("float") ? "any" : "1"}
                                    value={entry.value === null ? "" : entry.value}
                                    onChange={e => {
                                      const newEntries = [...editedEntries];
                                      const i = newEntries.findIndex(x => x.key === entry.key);
                                      if (i !== -1) {
                                        const val = e.target.value;
                                        newEntries[i].value = val === "" ? 0 : Number(val);
                                        setEditedEntries(newEntries);
                                      }
                                    }}
                                  />
                                ) : entry.value_type === "bool" ? (
                                  <div className="gguf-bool-switch">
                                    <button 
                                      className={`bool-btn ${entry.value ? 'active' : ''}`}
                                      onClick={() => {
                                        const newEntries = [...editedEntries];
                                        const i = newEntries.findIndex(x => x.key === entry.key);
                                        if (i !== -1) {
                                          newEntries[i].value = true;
                                          setEditedEntries(newEntries);
                                        }
                                      }}
                                    >TRUE</button>
                                    <button 
                                      className={`bool-btn ${!entry.value ? 'active' : ''}`}
                                      onClick={() => {
                                        const newEntries = [...editedEntries];
                                        const i = newEntries.findIndex(x => x.key === entry.key);
                                        if (i !== -1) {
                                          newEntries[i].value = false;
                                          setEditedEntries(newEntries);
                                        }
                                      }}
                                    >FALSE</button>
                                  </div>
                                ) : entry.value_type === "array" ? (
                                  <div className="gguf-array-container">
                                    <div className="gguf-array-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                                      <span className="gguf-array-count" style={{fontSize: '0.75rem', color: 'var(--fg-3)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px'}}>
                                        📦 {Array.isArray(entry.value) ? `${entry.value.length} items` : 'Formato desconocido'}
                                      </span>
                                      <button 
                                        className="btn-view-array" 
                                        style={{padding: '4px 10px', fontSize: '0.7rem', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--accent)', cursor: 'pointer'}}
                                        onClick={() => setEditModes(prev => ({...prev, [entry.key]: !prev[entry.key]}))}
                                      >
                                        {editModes[entry.key] ? '🗂️ Modo Lista' : '📝 Modo JSON Raw'}
                                      </button>
                                    </div>

                                    {editModes[entry.key] ? (
                                      <textarea
                                        className="gguf-editor-input premium-input json-mode"
                                        rows={10}
                                        value={JSON.stringify(entry.value, null, 2)}
                                        onChange={e => {
                                          try {
                                            const parsed = JSON.parse(e.target.value);
                                            const newEntries = [...editedEntries];
                                            const i = newEntries.findIndex(x => x.key === entry.key);
                                            if (i !== -1) {
                                              newEntries[i].value = parsed;
                                              setEditedEntries(newEntries);
                                            }
                                          } catch(err) {}
                                        }}
                                        placeholder="[JSON format]"
                                        style={{height: '200px', fontSize: '0.8rem', fontFamily: 'monospace'}}
                                      />
                                    ) : (
                                      <div className="gguf-array-visual-list" style={{maxHeight: '400px', overflowY: 'auto', background: 'var(--bg-0)', borderRadius: '6px', padding: '12px', border: '1px solid var(--border)'}}>
                                        {Array.isArray(entry.value) ? (
                                          <>
                                            <div className="array-items-grid" style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                                              {entry.value.slice(0, (expandedArrays[entry.key] || 1) * 100).map((item: any, idx: number) => (
                                                <div key={idx} className="array-item-row" style={{display: 'flex', gap: '10px', alignItems: 'center', padding: '6px', borderBottom: '1px solid rgba(255,255,255,0.03)'}}>
                                                  <span className="item-idx" style={{fontSize: '0.7rem', color: 'var(--accent)', minWidth: '45px', fontWeight: 'bold', opacity: 0.7}}>#{idx}</span>
                                                  <input 
                                                    className="item-input"
                                                    style={{background: 'transparent', border: 'none', color: 'var(--fg-1)', fontSize: '0.9rem', width: '100%', outline: 'none', fontFamily: 'monospace'}}
                                                    value={typeof item === 'string' ? item : JSON.stringify(item)}
                                                    onChange={(e) => {
                                                      const newEntries = [...editedEntries];
                                                      const i = newEntries.findIndex(x => x.key === entry.key);
                                                      if (i !== -1) {
                                                        const newList = [...(newEntries[i].value as any[])];
                                                        const val = e.target.value;
                                                        newList[idx] = isNaN(Number(val)) || val === "" ? val : Number(val);
                                                        newEntries[i].value = newList;
                                                        setEditedEntries(newEntries);
                                                      }
                                                    }}
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                            {entry.value.length > (expandedArrays[entry.key] || 1) * 100 && (
                                              <button 
                                                className="btn-load-more"
                                                style={{width: '100%', padding: '12px', marginTop: '12px', background: 'rgba(0, 229, 255, 0.05)', border: '1px dashed var(--accent)', borderRadius: '6px', cursor: 'pointer', color: 'var(--accent)', fontWeight: 'bold'}}
                                                onClick={() => setExpandedArrays(prev => ({...prev, [entry.key]: (prev[entry.key] || 1) + 1}))}
                                              >
                                                Cargar más tokens (+100) ...
                                              </button>
                                            )}
                                            <div style={{marginTop: '10px', fontSize: '0.75rem', color: 'var(--fg-3)', textAlign: 'right', opacity: 0.6}}>
                                              Mostrando {Math.min(entry.value.length, (expandedArrays[entry.key] || 1) * 100)} de {entry.value.length}
                                            </div>
                                          </>
                                        ) : (
                                          <div className="gguf-kv-fallback" style={{padding: '20px', textAlign: 'center', opacity: 0.5}}>
                                             {typeof entry.value === 'string' ? entry.value : "Este array no se pudo procesar correctamente."}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="gguf-kv-fallback">
                                    {formatValue(entry)}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {editedEntries.length > 0 && (
              <div className="gguf-editor-actions main-actions">
                {(() => {
                  const pendingCount = editedEntries.filter((e) => {
                    const original = entries.find(orig => orig.key === e.key);
                    if (!original) return true; // It's a new entry
                    return JSON.stringify(original.value) !== JSON.stringify(e.value);
                  }).length;
                  
                  return pendingCount > 0 ? (
                    <div className="gguf-editor-actions-inner">
                      <span className="gguf-pending-text">
                        ⚠️ {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
                      </span>
                      <div className="gguf-editor-btn-group">
                        <button 
                          className="gguf-save-btn btn-undo" 
                          onClick={() => setEditedEntries(JSON.parse(JSON.stringify(entries)))}
                          disabled={loading}
                        >
                          ↩ Deshacer
                        </button>
                        <button 
                          className="gguf-save-btn btn-apply" 
                          onClick={saveToGguf}
                          disabled={loading}
                        >
                          💾 Aplicar al archivo .gguf
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="gguf-editor-actions-inner">
                      <span className="gguf-saved-text">
                        ✓ Sin cambios pendientes
                      </span>
                      <button 
                        className="gguf-save-btn btn-apply disabled" 
                        disabled={true}
                      >
                        💾 Aplicar al archivo .gguf
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {activeTab === "templates" && (
          <div className="gguf-editor-pane templates-pane">
            <div className="templates-header">
              <h2>Gestión de Plantillas</h2>
              <p>Exportá los metadatos actuales como plantilla JSON para aplicarlos a otros modelos GGUF, o importá una plantilla existente para sobreescribir los valores actuales.</p>
            </div>
            
            <div className="gguf-template-actions main-template-actions">
              <button
                className="gguf-template-btn primary main-template-btn"
                onClick={exportTemplate}
                disabled={entries.length === 0}
              >
                <span className="icon">📤</span>
                <span className="text">Exportar Plantilla JSON</span>
              </button>
              <button
                className="gguf-template-btn main-template-btn"
                onClick={importTemplate}
              >
                <span className="icon">📥</span>
                <span className="text">Importar Plantilla JSON</span>
              </button>
            </div>

            {entries.length > 0 && (
              <div className="templates-summary">
                <h3>Resumen de Arquitectura</h3>
                <div className="templates-summary-grid">
                  {(() => {
                    const archEntry = entries.find(e => e.key === "general.architecture");
                    const arch = String(archEntry?.value || "llama");
                    
                    const summaryMap = [
                      ["general.architecture", "Arquitectura"],
                      ["general.name", "Nombre"],
                      ["general.quantization_version", "Cuantización"],
                      ["general.file_type", "Tipo de Archivo"],
                      [`${arch}.context_length`, "Context Length"],
                      [`${arch}.embedding_length`, "Embedding Dim"],
                      [`${arch}.block_count`, "Bloques (Layers)"],
                      [`${arch}.attention.head_count`, "Attention Heads"],
                      [`${arch}.attention.head_count_kv`, "KV Heads"],
                      ["general.parameter_count", "Parámetros"],
                    ];

                    return summaryMap.map(([key, label]) => {
                      const entry = entries.find(e => e.key === key);
                      if (!entry) return null;
                      return (
                        <div key={key} className="templates-summary-item anim-fade-in">
                          <span className="ts-label">{label}</span>
                          <span className="ts-value">{String(entry.value)}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {status && (
        <div className={`gguf-status main-status ${status.type}`}>
          {status.type === "loading" && <div className="gguf-spinner" />}
          {status.type === "success" && <span>✓</span>}
          {status.type === "error" && <span>✗</span>}
          <span>{status.msg}</span>
        </div>
      )}
    </div>
  );
}
