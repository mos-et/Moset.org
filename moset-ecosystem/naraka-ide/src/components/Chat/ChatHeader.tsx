import React from "react";
// Assumes Icons is passed or defined. For now, we will pass Icons as a prop to keep it simple, or we should extract Icons to a separate file.


interface ChatHeaderProps {
  Icons: Record<string, React.ReactNode>;
  isFloating?: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
  lastMetrics: {prompt_eval_count: number, eval_count: number} | null;
  config: { model: string; arch: string; };
  modelLoading: boolean;
  showInlineSettings: boolean;
  setShowInlineSettings: (show: boolean) => void;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  newChat: () => void;
  onToggleFloating?: () => void;
  onClose?: () => void;
}

export function ChatHeader({
  Icons,
  isFloating,
  onDragStart,
  lastMetrics,
  config,
  modelLoading,
  showInlineSettings,
  setShowInlineSettings,
  showHistory,
  setShowHistory,
  newChat,
  onToggleFloating,
  onClose
}: ChatHeaderProps) {
  return (
    <div 
      className={`chat-header ${onDragStart || isFloating ? 'chat-header-drag' : ''}`}
      onMouseDown={onDragStart}
    >
      <div className="header-left">
        <span className="header-icon">{Icons.moset}</span>
        <span className="header-title">Moset Studio</span>
        <span className="header-subline">/ Motor Soberano</span>
      </div>
      <div className="chat-header-right">
        {lastMetrics ? (
          <span className="chat-arch-badge chat-arch-badge-custom">
            CTX: {lastMetrics.prompt_eval_count} • GEN: {lastMetrics.eval_count}
          </span>
        ) : null}
        {config.arch && config.arch !== "" && (
          <span className="chat-arch-badge">{config.arch}</span>
        )}
        {modelLoading && (
          <div className="chat-loading-dots">
            <span/><span/><span/>
          </div>
        )}
        <button 
          className={`chat-icon-btn ${showInlineSettings ? 'active' : ''}`}
          onClick={() => setShowInlineSettings(!showInlineSettings)}
          title="Tokens de la Sesión"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
        </button>
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
