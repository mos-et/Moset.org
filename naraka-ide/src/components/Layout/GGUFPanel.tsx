import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import "../../styles/components/GGUFPanel.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GgufKvEntry {
  key: string;
  value_type: string;
  value: any;
}

interface GGUFPanelProps {
  onClose?: () => void;
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

export function GGUFPanel({ onClose }: GGUFPanelProps) {
  const [filePath, setFilePath] = useState("");
  const [entries, setEntries] = useState<GgufKvEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "loading" | "success" | "error"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"metadata" | "templates" | "editor">("metadata");
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editedEntries, setEditedEntries] = useState<GgufKvEntry[]>([]);

  // Load metadata from GGUF
  const loadMetadata = useCallback(async (pathOverride?: string) => {
    const pathToLoad = typeof pathOverride === "string" ? pathOverride : filePath;
    if (!pathToLoad) return;
    setLoading(true);
    setStatus({ type: "loading", msg: "Leyendo metadatos GGUF..." });
    setEntries([]);
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
  }, [filePath]);

  // Browse for .gguf file
  const browseFile = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "GGUF Models", extensions: ["gguf"] }],
        multiple: false,
      });
      if (selected) {
        setFilePath(selected as string);
        loadMetadata(selected as string);
      }
    } catch (e) {
      console.error("Error selecting file:", e);
    }
  }, [loadMetadata]);



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
      // Reload to reflect changes
      loadMetadata(filePath);
    } catch (e: any) {
      setStatus({ type: "error", msg: String(e) });
    }
  }, [filePath, editedEntries, loadMetadata]);

  // Filter entries
  const getFiltered = (list: GgufKvEntry[]) => filter
    ? list.filter(e => e.key.toLowerCase().includes(filter.toLowerCase()) || 
        String(e.value).toLowerCase().includes(filter.toLowerCase()))
    : list;

  const filtered = getFiltered(entries);
  const filteredEdited = getFiltered(editedEntries);

  const categories = categorize(filtered);
  const editCategories = categorize(filteredEdited);

  const modelName = entries.find(e => e.key === "general.name")?.value || 
                    entries.find(e => e.key === "general.architecture")?.value ||
                    filePath.split(/[\\/]/).pop() || "";

  return (
    <div className="gguf-panel">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="gguf-header">
        <div className="gguf-header-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          GGUF CONFIG
        </div>
      </div>

      {/* ─── File Selector ───────────────────────────────────── */}
      <div className="gguf-file-section">
        <div className="gguf-file-label">Archivo GGUF</div>
        <div className="gguf-file-row">
          <input
            className="gguf-file-path"
            value={filePath}
            onChange={e => setFilePath(e.target.value)}
            placeholder="Seleccionar modelo .gguf..."
            readOnly
          />
          <button className="gguf-browse-btn" onClick={browseFile}>📂</button>
          <button 
            className="gguf-load-btn" 
            onClick={() => loadMetadata()}
            disabled={!filePath || loading}
          >
            {loading ? "..." : "LEER"}
          </button>
        </div>
      </div>

      {/* ─── Model Info Banner ───────────────────────────────── */}
      {entries.length > 0 && (
        <div className="gguf-model-info">
          <span className="gguf-model-badge">GGUF</span>
          <span className="gguf-model-name">{String(modelName)}</span>
          <span className="gguf-model-count">{entries.length} KV</span>
        </div>
      )}

      {/* ─── Tabs ────────────────────────────────────────────── */}
      <div className="gguf-tabs">
        <button
          className={`gguf-tab ${activeTab === "metadata" ? "active" : ""}`}
          onClick={() => setActiveTab("metadata")}
        >
          Metadatos
        </button>
        <button
          className={`gguf-tab ${activeTab === "editor" ? "active" : ""}`}
          onClick={() => setActiveTab("editor")}
        >
          Editor
        </button>
        <button
          className={`gguf-tab ${activeTab === "templates" ? "active" : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          Plantillas
        </button>
      </div>

      {/* ─── Content ─────────────────────────────────────────── */}
      {activeTab === "metadata" && (
        <>
          {entries.length > 0 && (
            <div className="gguf-filter">
              <input
                className="gguf-filter-input"
                placeholder="Filtrar metadatos..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
          )}
          <div className="gguf-content">
            {entries.length === 0 && !loading ? (
              <div className="gguf-empty">
                <div className="gguf-empty-icon">🧬</div>
                <div className="gguf-empty-text">
                  Seleccioná un archivo <strong>.gguf</strong> y presioná <strong>LEER</strong> para inspeccionar sus metadatos internos.
                </div>
              </div>
            ) : (
              <div className="gguf-kv-list">
                {Object.entries(categories).map(([cat, items]) => (
                  <div className="gguf-category" key={cat}>
                    <div
                      className="gguf-category-header"
                      onClick={() => setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))}
                    >
                      <span className={`gguf-category-arrow ${collapsed[cat] ? "" : "open"}`}>▶</span>
                      {cat}
                      <span className="gguf-category-count">{items.length}</span>
                    </div>
                    {!collapsed[cat] && items.map((entry, idx) => (
                      <div className="gguf-kv-item" key={`${cat}-${idx}`}>
                        <div className="gguf-kv-header">
                          <span className="gguf-kv-key">{entry.key.split(".").pop()}</span>
                          <span className="gguf-kv-type">{entry.value_type}</span>
                        </div>
                        <div className={`gguf-kv-value ${getValueClass(entry.value_type)}`}>
                          {formatValue(entry)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "editor" && (
        <>
          {editedEntries.length > 0 && (
            <div className="gguf-filter">
              <input
                className="gguf-filter-input"
                placeholder="Filtrar metadatos para editar..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
          )}
          <div className="gguf-content">
            {editedEntries.length === 0 ? (
              <div className="gguf-empty">
                <div className="gguf-empty-icon">✏️</div>
                <div className="gguf-empty-text">Cargá un modelo para editar sus valores GGUF.</div>
              </div>
            ) : (
              <div className="gguf-kv-list">
                {Object.entries(editCategories).map(([cat, items]) => (
                  <div className="gguf-category" key={`edit-${cat}`}>
                    <div
                      className="gguf-category-header"
                      onClick={() => setCollapsed(prev => ({ ...prev, [`edit-${cat}`]: !prev[`edit-${cat}`] }))}
                    >
                      <span className={`gguf-category-arrow ${collapsed[`edit-${cat}`] ? "" : "open"}`}>▶</span>
                      {cat}
                      <span className="gguf-category-count">{items.length}</span>
                    </div>
                    {!collapsed[`edit-${cat}`] && items.map((entry, idx) => (
                      <div className="gguf-kv-item" key={`edit-${cat}-${idx}`}>
                        <div className="gguf-kv-header">
                          <span className="gguf-kv-key">{entry.key.split(".").pop()}</span>
                          <span className="gguf-kv-type">{entry.value_type}</span>
                        </div>
                        {entry.value_type === "string" || entry.value_type.startsWith("int") || entry.value_type.startsWith("float") || entry.value_type.startsWith("uint") ? (
                          <input
                            className="gguf-editor-input"
                            type={entry.value_type === "string" ? "text" : "number"}
                            step={entry.value_type.startsWith("float") ? "any" : "1"}
                            value={entry.value === null ? "" : entry.value}
                            onChange={e => {
                              const newEntries = [...editedEntries];
                              const i = newEntries.findIndex(x => x.key === entry.key);
                              if (i !== -1) {
                                if (entry.value_type === "string") {
                                  newEntries[i].value = e.target.value;
                                } else {
                                  const val = e.target.value;
                                  newEntries[i].value = val === "" ? 0 : Number(val);
                                }
                                setEditedEntries(newEntries);
                              }
                            }}
                          />
                        ) : entry.value_type === "bool" ? (
                          <select 
                            className="gguf-editor-input"
                            value={String(entry.value)}
                            onChange={e => {
                              const newEntries = [...editedEntries];
                              const i = newEntries.findIndex(x => x.key === entry.key);
                              if (i !== -1) {
                                newEntries[i].value = e.target.value === "true";
                                setEditedEntries(newEntries);
                              }
                            }}
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <div className={`gguf-kv-value ${getValueClass(entry.value_type)}`}>
                            {formatValue(entry)} (Solo lectura)
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {editedEntries.length > 0 && (
            <div className="gguf-editor-actions">
              {(() => {
                const pendingCount = editedEntries.filter((e, idx) => {
                  const original = entries.find(orig => orig.key === e.key);
                  return original && original.value !== e.value;
                }).length;
                
                return pendingCount > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                    <span style={{ color: "#F59E0B", fontSize: 12, fontWeight: 500, flex: 1 }}>
                      ⚠️ {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
                    </span>
                    <button 
                      className="gguf-save-btn" 
                      onClick={saveToGguf}
                      disabled={loading}
                    >
                      💾 Aplicar al archivo .gguf
                    </button>
                    <button 
                      className="gguf-save-btn" 
                      style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-2)", flex: 0 }}
                      onClick={() => setEditedEntries(JSON.parse(JSON.stringify(entries)))}
                      disabled={loading}
                    >
                      ↩ Deshacer
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                    <span style={{ color: "var(--text-3)", fontSize: 12, flex: 1 }}>
                      ✓ Sin cambios pendientes
                    </span>
                    <button 
                      className="gguf-save-btn" 
                      disabled={true}
                      style={{ opacity: 0.5, filter: "grayscale(100%)" }}
                    >
                      💾 Aplicar al archivo .gguf
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}

      {activeTab === "templates" && (
        <div className="gguf-content">
          <div className="gguf-templates">
            <div className="gguf-file-label" style={{ marginBottom: 4 }}>Gestión de Plantillas</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5, marginBottom: 8 }}>
              Exportá los metadatos actuales como plantilla JSON para aplicarlos a otros modelos GGUF.
            </div>
            <div className="gguf-template-actions">
              <button
                className="gguf-template-btn primary"
                onClick={exportTemplate}
                disabled={entries.length === 0}
              >
                📤 Exportar
              </button>
              <button
                className="gguf-template-btn"
                onClick={importTemplate}
              >
                📥 Importar
              </button>
            </div>

            {entries.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="gguf-file-label" style={{ marginBottom: 6 }}>Resumen del modelo</div>
                {[
                  ["general.architecture", "Arquitectura"],
                  ["general.name", "Nombre"],
                  ["general.quantization_version", "Cuantización"],
                  ["general.file_type", "Tipo de Archivo"],
                  ["llama.context_length", "Context Length"],
                  ["llama.embedding_length", "Embedding Dim"],
                  ["llama.block_count", "Bloques"],
                  ["llama.attention.head_count", "Attention Heads"],
                ].map(([key, label]) => {
                  const entry = entries.find(e => e.key === key);
                  if (!entry) return null;
                  return (
                    <div key={key} style={{ 
                      display: "flex", justifyContent: "space-between", 
                      padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)",
                      fontSize: 11 
                    }}>
                      <span style={{ color: "var(--text-3)" }}>{label}</span>
                      <span style={{ color: "#A855F7", fontWeight: 600, fontFamily: "'Cascadia Code', monospace" }}>
                        {String(entry.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Status Bar ──────────────────────────────────────── */}
      {status && (
        <div className={`gguf-status ${status.type}`}>
          {status.type === "loading" && <div className="gguf-spinner" />}
          {status.type === "success" && <span>✓</span>}
          {status.type === "error" && <span>✗</span>}
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {status.msg}
          </span>
        </div>
      )}
    </div>
  );
}
