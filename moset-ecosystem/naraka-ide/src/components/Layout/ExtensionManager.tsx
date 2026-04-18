import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Extension } from "../../utils/fileTypes";

export function ExtensionManager() {
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
