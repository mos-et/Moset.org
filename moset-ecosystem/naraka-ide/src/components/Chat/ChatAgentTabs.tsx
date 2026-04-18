import React from "react";
import { ChatSession } from "../../hooks/useSoberanoChat";

interface ChatAgentTabsProps {
  Icons: Record<string, React.ReactNode>;
  sessions: ChatSession[];
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
}

export function ChatAgentTabs({
  Icons,
  sessions,
  activeSessionId,
  setActiveSessionId,
  setSessions
}: ChatAgentTabsProps) {
  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (sessions.length <= 1) return;
    const isEditing = activeSessionId === id;
    setSessions(prev => prev.filter(s => s.id !== id));
    if (isEditing) {
      const idx = sessions.findIndex(s => s.id === id);
      const nextIdx = idx > 0 ? idx - 1 : 1;
      if (sessions[nextIdx]) {
        setActiveSessionId(sessions[nextIdx].id);
      }
    }
  };

  return (
    <div className="chat-history-drawer active p-4">
      <div className="history-header" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Historial de Agentes</span>
      </div>
      <div className="session-list">
        {sessions.map(s => (
          <div 
             key={s.id} 
             className={"session-item" + (s.id === activeSessionId ? " active" : "")}
             onClick={() => setActiveSessionId(s.id)}
          >
             <div className="session-info">
               <span className="session-title">{s.title}</span>
               <span className="session-date">{new Date(s.ts).toLocaleDateString()} {new Date(s.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
             </div>
             {sessions.length > 1 && (
               <button 
                 className="session-delete" 
                 onClick={(e) => deleteSession(e, s.id)}
                 title="Eliminar sesión"
               >
                 {Icons.trash}
               </button>
             )}
          </div>
        ))}
      </div>
    </div>
  );
}
