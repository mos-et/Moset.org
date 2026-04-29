import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { PanelHeader } from "./PanelHeader";
import "../../styles/components/GGUFPanel.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GgufKvEntry {
  key: string;
  value_type: string;
  value: any;
}

interface GGUFPanelProps {
  onClose?: () => void;
  onOpenEditor?: (filePath: string) => void;
  isFloating?: boolean;
  onToggleFloating?: () => void;
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

export function GGUFPanel({ onClose, onOpenEditor, isFloating, onToggleFloating }: GGUFPanelProps) {
  const [filePath, setFilePath] = useState("");
  const [entries, setEntries] = useState<GgufKvEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "loading" | "success" | "error"; msg: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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



  // Filter entries
  const getFiltered = (list: GgufKvEntry[]) => filter
    ? list.filter(e => e.key.toLowerCase().includes(filter.toLowerCase()) || 
        String(e.value).toLowerCase().includes(filter.toLowerCase()))
    : list;

  const filtered = getFiltered(entries);
  const categories = categorize(filtered);

  const modelName = entries.find(e => e.key === "general.name")?.value || 
                    entries.find(e => e.key === "general.architecture")?.value ||
                    filePath.split(/[\\/]/).pop() || "";

  return (
    <div className="gguf-panel">
      {/* ─── Header ──────────────────────────────────────────── */}
      <PanelHeader 
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            GGUF CONFIG
          </span>
        } 
        onClose={() => onClose?.()}
        isFloating={isFloating}
        onToggleFloating={onToggleFloating}
      />

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

      {/* ─── Tabs/Editor Button ──────────────────────────────── */}
      {filePath && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
          <button
            className="gguf-load-btn"
            style={{ width: "100%", padding: "8px", fontWeight: "bold" }}
            onClick={() => onOpenEditor?.(filePath)}
          >
            Abrir en Editor Principal
          </button>
        </div>
      )}

      {/* ─── Content ─────────────────────────────────────────── */}
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
