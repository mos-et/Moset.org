const fs = require('fs');
const filepath = 's:/Naraka Studio/Moset/moset-ecosystem/naraka-ide/src/App.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// The regex matches everything from <div className="settings-modal"... up to <div className="settings-content"...
// Note: We'll replace it with the new layout that splits the modal into sidebar and content.
const modalToContentRegex = /<div className="settings-modal"[\s\S]+?<div className="settings-content"[^>]+>/;

const newLayout = `<div className="settings-modal" onClick={e => e.stopPropagation()} style={{
        background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: "12px",
        width: "850px", maxWidth: "90vw", height: "70vh", maxHeight: "85vh",
        display: "flex", flexDirection: "column", boxShadow: "0 20px 40px rgba(0,0,0,0.5)", overflow: "hidden"
      }}>
        <div className="settings-header" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px", borderBottom: "1px solid var(--border)"
        }}>
          <h2 style={{ fontSize: "16px", margin: 0, color: "var(--text-1)", fontWeight: 600 }}>Ajustes del Sistema Soberano</h2>
          <button onClick={() => { save(); onClose(); }} style={{ background: "transparent", border: "none", color: "var(--text-2)", cursor: "pointer", fontSize: "18px" }}>✕</button>
        </div>
        
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Sidebar de Pestañas */}
          <div style={{ width: "220px", background: "var(--bg-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div className={\`settings-tab \${openSection === 'ide' ? 'active' : ''}\`} onClick={() => setOpenSection('ide')} style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: openSection === 'ide' ? "var(--bg-3)" : "transparent", color: openSection === 'ide' ? "var(--accent)" : "var(--text-2)", fontWeight: openSection === 'ide' ? 600 : 400, borderLeft: openSection === 'ide' ? "3px solid var(--accent)" : "3px solid transparent", fontSize: "13px" }}>Motor IDE</div>
            <div className={\`settings-tab \${openSection === 'ai_providers' ? 'active' : ''}\`} onClick={() => setOpenSection('ai_providers')} style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: openSection === 'ai_providers' ? "var(--bg-3)" : "transparent", color: openSection === 'ai_providers' ? "var(--accent)" : "var(--text-2)", fontWeight: openSection === 'ai_providers' ? 600 : 400, borderLeft: openSection === 'ai_providers' ? "3px solid var(--accent)" : "3px solid transparent", fontSize: "13px" }}>Inteligencia (Modelos)</div>
            <div className={\`settings-tab \${openSection === 'orquestador' ? 'active' : ''}\`} onClick={() => setOpenSection('orquestador')} style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: openSection === 'orquestador' ? "var(--bg-3)" : "transparent", color: openSection === 'orquestador' ? "var(--accent)" : "var(--text-2)", fontWeight: openSection === 'orquestador' ? 600 : 400, borderLeft: openSection === 'orquestador' ? "3px solid var(--accent)" : "3px solid transparent", fontSize: "13px" }}>Orquestador</div>
            <div className={\`settings-tab \${openSection === 'vigilante' ? 'active' : ''}\`} onClick={() => setOpenSection('vigilante')} style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: openSection === 'vigilante' ? "var(--bg-3)" : "transparent", color: openSection === 'vigilante' ? "var(--accent)" : "var(--text-2)", fontWeight: openSection === 'vigilante' ? 600 : 400, borderLeft: openSection === 'vigilante' ? "3px solid var(--accent)" : "3px solid transparent", fontSize: "13px" }}>Vigilante (Seguridad)</div>
            <div className={\`settings-tab \${openSection === 'quantum' ? 'active' : ''}\`} onClick={() => setOpenSection('quantum')} style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: openSection === 'quantum' ? "var(--bg-3)" : "transparent", color: openSection === 'quantum' ? "var(--accent)" : "var(--text-2)", fontWeight: openSection === 'quantum' ? 600 : 400, borderLeft: openSection === 'quantum' ? "3px solid var(--accent)" : "3px solid transparent", fontSize: "13px" }}>Inteligencia Cuántica</div>
            <div className={\`settings-tab \${openSection === 'gpu' ? 'active' : ''}\`} onClick={() => setOpenSection('gpu')} style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: openSection === 'gpu' ? "var(--bg-3)" : "transparent", color: openSection === 'gpu' ? "var(--accent)" : "var(--text-2)", fontWeight: openSection === 'gpu' ? 600 : 400, borderLeft: openSection === 'gpu' ? "3px solid var(--accent)" : "3px solid transparent", fontSize: "13px" }}>GPU / CUDA</div>
            <div style={{ flex: 1 }}></div>
          </div>
          <div className="settings-content" style={{ padding: "24px", overflowY: "auto", flex: 1, color: "var(--text-1)", display: "flex", flexDirection: "column" }}>`;
          
content = content.replace(modalToContentRegex, newLayout);

// Remove the inline accordion headers:
content = content.replace(/<div style=\{sectionHeaderStyle\} onClick=\{\(\) => toggleSection\("[^"]+"\)\}>[\s\S]*?<\/svg>\s*<span>.*?<\/span>\s*<\/div>/g, '');

// Insert MaxTokens UI inside "ai_providers" section just before its ending parenthesis '{openSection === "ai_providers" && (...)}'
const aiProvidersClosingRegex = /(\{\/\* ── Orquestador ──────────────────────── \*\/\})/;
const tokensUI = `
          <div className="form-group" style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
            <label style={labelStyle}>Max Tokens de respuesta</label>
            <div className="token-selector" style={{ display: 'flex', gap: '8px' }}>
              {[1024, 2048, 4096, 8192].map(val => (
                <button
                  key={val}
                  style={{ flex: 1, padding: '6px', background: maxTokens === val ? 'var(--accent)' : 'var(--bg-3)', color: maxTokens === val ? '#000' : 'var(--text-1)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: maxTokens === val ? 'bold' : 'normal', fontSize: '11px' }}
                  onClick={() => setMaxTokens(val)}
                >
                  {val >= 1024 ? (val / 1024) + "K" : val}
                </button>
              ))}
            </div>
            <span className="form-hint" style={{ fontSize: '9px', color: 'var(--text-3)', marginTop: '4px', display: 'block' }}>
              {maxTokens <= 1024 ? "Corto (~700 palabras)" : maxTokens <= 2048 ? "Normal (~1400 palabras)" : maxTokens <= 4096 ? "Largo (~3000 palabras)" : "Máximo (~6000 palabras)"}
            </span>
          </div>
          <div className="form-group" style={{ marginTop: "12px" }}>
            <label style={labelStyle}>Tokens de codificación (Contexto Total)</label>
            <div className="token-selector" style={{ display: 'flex', gap: '8px' }}>
              {[2048, 4096, 8192, 16384].map(val => (
                <button
                  key={val}
                  style={{ flex: 1, padding: '6px', background: contextTokens === val ? 'var(--accent)' : 'var(--bg-3)', color: contextTokens === val ? '#000' : 'var(--text-1)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: contextTokens === val ? 'bold' : 'normal', fontSize: '11px' }}
                  onClick={() => setContextTokens(val)}
                >
                  {(val / 1024) + "K"}
                </button>
              ))}
            </div>
            <span className="form-hint" style={{ fontSize: '9px', color: 'var(--text-3)', marginTop: '4px', display: 'block' }}>
              {contextTokens <= 2048 ? "Liviano — modelos chicos" : contextTokens <= 4096 ? "Balanceado" : contextTokens <= 8192 ? "Amplio — modelos medianos" : "Máximo — modelos grandes (32K+ ctx)"}
            </span>
          </div>

          `;
content = content.replace(aiProvidersClosingRegex, tokensUI + "\n$1");

// Fix bottom buttons wrapper logic: the end of SettingsPanel has a bunch of buttons and closing divs.
const bottomButtonsRegex = /<div style=\{\{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '24px' \}\}>[\s\S]+?<\/div>\s*<\/div>\s*<\/div>\s*\)\;/;
const newBottomButtons = `<div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '24px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={async () => {
                  try {
                    await invoke("descargar_modelo");
                    alert("Motor Soberano descargado. RAM/vRAM liberada exitosamente.");
                  } catch(e) {
                    alert("Error liberando memoria: " + e);
                  }
                }}
                style={{ flex: 1, padding: "8px", background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "var(--fg-1)", borderRadius: "6px", cursor: "pointer", fontSize: "12px", transition: "all 0.2s" }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(255,80,80,0.2)"}
                onMouseOut={e => e.currentTarget.style.background = "rgba(255,80,80,0.1)"}
              >
                Liberar vRAM y RAM
              </button>
              <button 
                onClick={async () => {
                  try {
                    await invoke("clean_cuda_cache");
                    alert("Compilaciones CUDA antiguas eliminadas correctamente.");
                  } catch(e) {
                    alert("Error limpiando CUDA: " + e);
                  }
                }}
                style={{ flex: 1, padding: "8px", background: "rgba(80,200,255,0.1)", border: "1px solid rgba(80,200,255,0.3)", color: "var(--fg-1)", borderRadius: "6px", cursor: "pointer", fontSize: "12px", transition: "all 0.2s" }}
                onMouseOver={e => e.currentTarget.style.background = "rgba(80,200,255,0.2)"}
                onMouseOut={e => e.currentTarget.style.background = "rgba(80,200,255,0.1)"}
              >
                Limpiar Compilación CUDA
              </button>
            </div>
            <button 
              onClick={() => {
                import('@tauri-apps/plugin-opener').then(m => m.openUrl("https://moset.org")).catch(e => console.error(e));
              }}
              style={{ width: "100%", padding: "8px", background: "transparent", border: "1px solid var(--border)", color: "var(--accent)", borderRadius: "6px", cursor: "pointer", fontSize: "12px", transition: "all 0.2s" }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(90, 200, 255, 0.1)"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >
              Visitar sitio web moset.org ↗
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );`;
content = content.replace(bottomButtonsRegex, newBottomButtons);

fs.writeFileSync(filepath, content);
console.log('App.tsx transformed successfully!');
