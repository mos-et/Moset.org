import React from "react";

interface ChatDropZoneProps {
  isDragOver: boolean;
  setIsDragOver: (isDragging: boolean) => void;
  setContextPaths?: React.Dispatch<React.SetStateAction<string[]>>;
  contextPaths?: string[];
  children: React.ReactNode;
}

export function ChatDropZone({
  isDragOver,
  setIsDragOver,
  setContextPaths,
  contextPaths,
  children
}: ChatDropZoneProps) {
  return (
    <div 
      className="chat-drop-zone-container"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes("application/moset-path")) {
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("application/moset-path")) {
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const path = e.dataTransfer.getData("application/moset-path");
        if (path && setContextPaths && contextPaths) {
          if (!contextPaths.includes(path)) {
            setContextPaths([...contextPaths, path]);
          }
        }
      }}
    >
      {isDragOver && (
        <div className="chat-drop-zone-overlay">
          <div className="chat-drop-zone-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Soltar para Expandir Contexto
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
