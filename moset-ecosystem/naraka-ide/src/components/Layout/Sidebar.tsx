

interface SidebarProps {
  active: string;
  setActive: (s: string) => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
}

export function Sidebar({ active, setActive, chatOpen, setChatOpen }: SidebarProps) {
  const items = [
    { id: "explorer", icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ), label: "Explorador" },
    { id: "search", icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ), label: "Buscar" },
    { id: "run", icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    ), label: "Ejecutar" },
    { id: "extensions", icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    ), label: "Extensiones" },
  ];

  return (
    <div className="activity-bar">
      <div className="activity-bar-logo" title="Moset IDE" style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "15px" }}>
        <img src="/moset-logo.png" alt="Moset" style={{ width: 34, height: 34, objectFit: "contain", backgroundColor: "white", padding: "2px", filter: "drop-shadow(0 0 8px rgba(0,229,255,0.4))", borderRadius: "8px" }} />
      </div>
      
      {items.map(item => (
        <button
          key={item.id}
          className={`activity-btn ${active === item.id ? "active" : ""}`}
          onClick={() => setActive(active === item.id ? "" : item.id)}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}

      <div className="activity-bar-spacer" />
      
      <button
        className={`activity-btn bottom ${chatOpen ? "active" : ""}`}
        onClick={() => setChatOpen(!chatOpen)}
        title="Soberano AI"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <button
        className={`activity-btn bottom ${active === "settings" ? "active" : ""}`}
        onClick={() => setActive(active === "settings" ? "" : "settings")}
        title="Ajustes y Parámetros Radiales"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  );
}

