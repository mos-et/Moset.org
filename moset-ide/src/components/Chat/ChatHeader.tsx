import React from "react";
// Assumes Icons is passed or defined. For now, we will pass Icons as a prop to keep it simple, or we should extract Icons to a separate file.


interface ChatHeaderProps {
  Icons: Record<string, React.ReactNode>;
  isFloating?: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
  lastMetrics: {prompt_eval_count: number, eval_count: number} | null;
  modelLoading: boolean;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  newChat: () => void;
  onLoadModel?: () => void;
  isModelLoaded?: boolean;
  onToggleFloating?: () => void;
  onClose?: () => void;
}

export function ChatHeader({
  Icons,
  isFloating,
  onDragStart,
  lastMetrics,
  modelLoading,
  showHistory,
  setShowHistory,
  newChat,
  onLoadModel,
  isModelLoaded,
  onToggleFloating,
  onClose
}: ChatHeaderProps) {
  return (
      <div 
        className={`chat-header ${onDragStart || isFloating ? 'chat-header-drag' : ''}`}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          if (onDragStart) {
            e.preventDefault();
            onDragStart(e);
          }
        }}
      >
      <div className="header-left">
        <span className="header-icon">{Icons.moset}</span>
        <span className="header-title">Moset</span>
      </div>
      <div className="chat-header-right">
        {lastMetrics ? (
          <span className="chat-arch-badge chat-arch-badge-custom">
            CTX: {lastMetrics.prompt_eval_count} • GEN: {lastMetrics.eval_count}
          </span>
        ) : null}
        {modelLoading && (
          <div className="chat-loading-dots">
            <span/><span/><span/>
          </div>
        )}

        {onLoadModel && (
          <button 
            className={`chat-icon-btn load-model-btn ${isModelLoaded ? 'loaded' : ''}`} 
            onClick={onLoadModel}
            title={isModelLoaded ? "Liberar RAM (Descargar Motor)" : "Cargar Motor Naraka (Weights -> RAM)"}
            disabled={modelLoading}
          >
            {isModelLoaded ? (Icons.trash || Icons.close || "❌") : (Icons.bolt || Icons.zap || "⚡")}
          </button>
        )}
        <button 
          className="chat-icon-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("open-settings"))} 
          title="Ajustes Globales del Sistema"
        >
          {Icons.settings}
        </button>
        <button 
          className={"chat-icon-btn" + (showHistory ? " active" : "")} 
          onClick={() => setShowHistory(!showHistory)}
          title="Historial de Agentes"
        >
          {Icons.history}
        </button>
        <button 
          className="chat-icon-btn new-chat-btn" 
          onClick={newChat}
          title="Nuevo Agente"
        >
          {Icons.plus}
        </button>
        {onToggleFloating && (
          <button 
            className="chat-icon-btn detach-btn" 
            onClick={onToggleFloating}
            title={isFloating ? "Acoplar panel lateral" : "Extraer ventana flotante"}
          >
            {isFloating ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M15 3v18" />
                <path d="M8 8h4M8 12h4M8 16h4" opacity="0.4" />
              </svg>
            )}
          </button>
        )}
        {onClose && (
          <button className="chat-icon-btn close-btn" onClick={onClose} title="Cerrar Panel">
            {Icons.close}
          </button>
        )}
      </div>
    </div>
  );
}
