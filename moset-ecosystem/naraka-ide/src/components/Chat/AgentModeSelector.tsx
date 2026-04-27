import React from "react";
import { ContextSelector } from "./ContextSelector";

export function AgentModeSelector({ mode, onChange, contextMode, onContextChange, turboMode, onTurboChange, Icons }: any) {
  return (
    <div className="agent-mode-selector">
      <button className={`agent-mode-btn planear ${mode === "planear" ? "active" : ""}`} onClick={() => onChange("planear")}>{Icons.brain} Planear</button>
      <button className={`agent-mode-btn actuar ${mode === "actuar" ? "active" : ""}`} onClick={() => onChange("actuar")}>{Icons.zap} Actuar</button>
      <div className="agent-mode-separator" />
      <button className={`agent-mode-btn turbo ${turboMode ? "active" : ""}`} onClick={() => onTurboChange(!turboMode)} title="Auto-ejecutar herramientas">{Icons.zap} Turbo</button>
      <div className="agent-mode-separator" />
      <ContextSelector Icons={Icons} mode={contextMode} onChange={onContextChange} />
    </div>
  );
}
