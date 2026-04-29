import { ReactNode } from "react";

interface PanelHeaderProps {
  title: ReactNode;
  onClose: () => void;
  isFloating?: boolean;
  onToggleFloating?: () => void;
  onDragStart?: (e: React.MouseEvent) => void;
}

export function PanelHeader({ title, onClose, isFloating, onToggleFloating, onDragStart }: PanelHeaderProps) {
  return (
    <div
      className="panel-header"
      onMouseDown={isFloating ? onDragStart : undefined}
      style={isFloating ? { cursor: 'grab' } : undefined}
    >
      <span>{title}</span>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {onToggleFloating && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFloating(); }}
            title={isFloating ? "Acoplar panel" : "Hacer flotante"}
            className="panel-header-float-btn"
          >
            {isFloating ? "⬅" : "🗗"}
          </button>
        )}
        <button onClick={onClose}>✕</button>
      </div>
    </div>
  );
}
