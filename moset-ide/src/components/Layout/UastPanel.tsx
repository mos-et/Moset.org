import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useIdeConfig } from "../../hooks/useIdeConfig";
import { PanelHeader } from "./PanelHeader";

interface EtDict {
  proyecto: string;
  idioma_canonico: string;
  version: number;
  identifiers: Record<string, IdentEntry>;
  _exists?: boolean;
}

interface IdentEntry {
  tipo: string;
  traducciones: Record<string, string>;
}

interface UastPanelProps {
  onClose: () => void;
  projectRoot: string | null;
  isFloating?: boolean;
  onToggleFloating?: () => void;
  onDragStart?: (e: React.MouseEvent) => void;
  onOpenFolder?: () => void;
}

export function UastPanel({ onClose, projectRoot, isFloating, onToggleFloating, onDragStart, onOpenFolder }: UastPanelProps) {
  const ideConfig = useIdeConfig();
  const [dict, setDict] = useState<EtDict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [newCanonico, setNewCanonico] = useState("");
  const [newTranslated, setNewTranslated] = useState("");

  const fetchDict = async () => {
    if (!projectRoot) return;
    setLoading(true);
    setError(null);
    try {
      const result: EtDict = await invoke("get_et_dict", { dirProyecto: projectRoot });
      setDict(result);
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDict();
    // Refetch when language changes just in case, though usually state handles it
  }, [projectRoot, ideConfig.lensLanguage]);

  const handleSave = async (canonico: string) => {
    if (!projectRoot || !editValue.trim()) {
      setEditingKey(null);
      return;
    }

    try {
      await invoke("actualizar_traduccion_dict", {
        dirProyecto: projectRoot,
        canonico: canonico,
        idioma: ideConfig.lensLanguage,
        nuevoNombre: editValue.trim()
      });
      setEditingKey(null);
      fetchDict(); // Refresh dictionary
    } catch (err: any) {
      alert("Error al actualizar: " + err);
    }
  };

  const startEdit = (canonico: string, currentTranslation: string) => {
    setEditingKey(canonico);
    setEditValue(currentTranslation);
  };

  if (!projectRoot) {
    return (
      <div className="panel-content">
        <PanelHeader title="UAST Diccionario" onClose={onClose} isFloating={isFloating} onToggleFloating={onToggleFloating} onDragStart={onDragStart} />
        <div style={{ padding: "1rem", color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center", marginTop: "2rem" }}>
          <div>Abre un proyecto para ver su Diccionario UAST (.et-dict).</div>
          {onOpenFolder && (
            <button className="moset-btn" onClick={onOpenFolder}>
              Abrir Proyecto
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel-content" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader title="UAST Diccionario" onClose={onClose} isFloating={isFloating} onToggleFloating={onToggleFloating} onDragStart={onDragStart} />
      
      <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
          Idioma actual: <strong style={{ color: "var(--accent)" }}>{ideConfig.lensLanguage}</strong>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button 
            className="moset-btn small" 
            title="Purgar registros huérfanos"
            onClick={async () => {
              if (!projectRoot) return;
              try {
                const eliminados = await invoke<number>("purgar_et_dict", { dirProyecto: projectRoot });
                alert(`Purga completa. Se eliminaron ${eliminados} registros huérfanos.`);
                fetchDict();
              } catch (e) {
                alert("Error purgando registros: " + e);
              }
            }}
          >
            🧹
          </button>
          <button className="moset-btn small" onClick={fetchDict}>
            ↻
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
        {loading && <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>Cargando diccionario...</div>}
        {error && <div style={{ color: "var(--error)", fontSize: "0.9rem" }}>{error}</div>}

        {!loading && dict && !dict._exists && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "2rem", gap: "1rem" }}>
            <div style={{ color: "var(--text-dim)", fontSize: "0.9rem", textAlign: "center" }}>
              Este proyecto no tiene un diccionario UAST (.et-dict) creado.
            </div>
            <button 
              className="moset-btn" 
              onClick={async () => {
                if (!projectRoot) return;
                try {
                  setLoading(true);
                  await invoke("crear_et_dict_por_defecto", { dirProyecto: projectRoot });
                  await fetchDict();
                } catch (e) {
                  alert("Error creando diccionario: " + e);
                  setLoading(false);
                }
              }}
            >
              Crear Diccionario
            </button>
          </div>
        )}

        {!loading && dict && dict._exists && Object.keys(dict.identifiers).length === 0 && (
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem", textAlign: "center", marginTop: "2rem", marginBottom: "1rem" }}>
            No hay identificadores registrados en este proyecto.
          </div>
        )}

        {!loading && dict && dict._exists && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {Object.keys(dict.identifiers).length > 0 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", paddingBottom: "0.5rem", borderBottom: "1px solid var(--border)", fontSize: "0.8rem", color: "var(--text-dim)" }}>
                  <span>Canónico (es)</span>
                  <span>Traducción ({ideConfig.lensLanguage})</span>
                </div>
                
                {Object.entries(dict.identifiers).map(([canonico, entry]) => {
                  const translated = entry.traducciones[ideConfig.lensLanguage] || canonico;
                  const isEditing = editingKey === canonico;

              return (
                <div key={canonico} style={{ 
                  display: "grid", 
                  gridTemplateColumns: "1fr 1fr", 
                  gap: "0.5rem", 
                  padding: "0.5rem 0",
                  borderBottom: "1px solid var(--bg-hover)",
                  alignItems: "center"
                }}>
                  <div style={{ fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)" }}>
                    {canonico}
                    <div style={{ fontSize: "0.7rem", color: "var(--accent)", opacity: 0.7, marginTop: "2px" }}>{entry.tipo}</div>
                  </div>
                  
                  {isEditing ? (
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <input
                        autoFocus
                        style={{
                          width: "100%",
                          padding: "0.25rem 0.5rem",
                          background: "var(--bg-active)",
                          border: "1px solid var(--accent)",
                          color: "var(--text)",
                          borderRadius: "4px",
                          outline: "none",
                          fontSize: "0.9rem"
                        }}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleSave(canonico);
                          if (e.key === "Escape") setEditingKey(null);
                        }}
                      />
                      <button 
                        style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", padding: "0 0.25rem" }}
                        onClick={() => handleSave(canonico)}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div 
                      style={{ 
                        fontSize: "0.9rem", 
                        color: "var(--text-dim)", 
                        cursor: "pointer",
                        padding: "0.25rem",
                        borderRadius: "4px"
                      }}
                      className="uast-entry-hover"
                      onClick={() => startEdit(canonico, translated)}
                      title="Clic para editar traducción"
                    >
                      {translated}
                    </div>
                  )}
                </div>
              );
            })}
              </>
            )}

            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr auto", 
              gap: "0.5rem", 
              marginTop: "1rem", 
              padding: "0.5rem", 
              background: "var(--bg-hover)", 
              borderRadius: "4px",
              alignItems: "center"
            }}>
              <input
                placeholder="Canónico (ej. 'mi_variable')"
                style={{
                  width: "100%",
                  padding: "0.25rem 0.5rem",
                  background: "var(--bg-active)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: "4px",
                  outline: "none",
                  fontSize: "0.9rem"
                }}
                value={newCanonico}
                onChange={e => setNewCanonico(e.target.value)}
              />
              <input
                placeholder={`Traducción en '${ideConfig.lensLanguage}'`}
                style={{
                  width: "100%",
                  padding: "0.25rem 0.5rem",
                  background: "var(--bg-active)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: "4px",
                  outline: "none",
                  fontSize: "0.9rem"
                }}
                value={newTranslated}
                onChange={e => setNewTranslated(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newCanonico.trim() && newTranslated.trim()) {
                    invoke("actualizar_traduccion_dict", {
                      dirProyecto: projectRoot,
                      canonico: newCanonico.trim(),
                      idioma: ideConfig.lensLanguage,
                      nuevoNombre: newTranslated.trim()
                    }).then(() => {
                      setNewCanonico("");
                      setNewTranslated("");
                      fetchDict();
                    }).catch(err => alert("Error: " + err));
                  }
                }}
              />
              <button 
                className="moset-btn small"
                title="Añadir nuevo identificador"
                disabled={!newCanonico.trim() || !newTranslated.trim()}
                onClick={async () => {
                  if (!projectRoot || !newCanonico.trim() || !newTranslated.trim()) return;
                  try {
                    await invoke("actualizar_traduccion_dict", {
                      dirProyecto: projectRoot,
                      canonico: newCanonico.trim(),
                      idioma: ideConfig.lensLanguage,
                      nuevoNombre: newTranslated.trim()
                    });
                    setNewCanonico("");
                    setNewTranslated("");
                    fetchDict();
                  } catch (err: any) {
                    alert("Error al añadir: " + err);
                  }
                }}
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .uast-entry-hover:hover {
          background: var(--bg-hover);
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
