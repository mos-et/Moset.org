import React, { useState, useRef, useEffect } from "react";
import { ContextMode } from "../../hooks/useIdeConfig";

interface ContextSelectorProps {
  Icons: Record<string, React.ReactNode>;
  mode: ContextMode;
  onChange: (mode: ContextMode) => void;
}

export function ContextSelector({ Icons, mode, onChange }: ContextSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options: { id: ContextMode; label: string; sub: string; icon: React.ReactNode }[] = [
    { 
      id: "project", 
      label: "Proyecto Completo", 
      sub: "Contexto de todo el workspace", 
      icon: Icons.folder 
    },
    { 
      id: "selected", 
      label: "Selección Manual", 
      sub: "Solo los cerebritos 🧠 tildados en el explorador", 
      icon: Icons.brain 
    },
    { 
      id: "none", 
      label: "Sin Contexto", 
      sub: "Solo el prompt directo", 
      icon: Icons.close 
    },
  ];

  return (
    <div className="context-selector" ref={menuRef}>
      <button 
        className={`agent-mode-btn contexto ${mode !== 'none' ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={`Contexto actual: ${mode}`}
      >
        {mode === "none" && Icons.close}
        {mode === "selected" && Icons.brain}
        {mode === "project" && Icons.folder}
        <span className="context-label">Contexto</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`context-selector-icon ${isOpen ? 'open' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {isOpen && (
        <div className="context-menu animate-in-up">
          <div className="context-menu-header">Modo de Contexto</div>
          {options.map(opt => (
            <div 
              key={opt.id} 
              className={`context-menu-item ${mode === opt.id ? 'active' : ''}`}
              onClick={() => {
                onChange(opt.id);
                setIsOpen(false);
              }}
            >
              <div className="item-icon">{opt.icon}</div>
              <div className="item-text">
                <div className="item-label">{opt.label}</div>
                <div className="item-sub">{opt.sub}</div>
              </div>
              {mode === opt.id && <div className="item-check">{Icons.check}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
