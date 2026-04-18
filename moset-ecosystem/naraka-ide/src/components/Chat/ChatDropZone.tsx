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
      className="chat-drop-zone-wrapper"
      style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}
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
        <div style={{
          position: "absolute", 
          inset: 0, 
          background: "rgba(0, 168, 255, 0.05)", 
          backdropFilter: "blur(4px)",
          zIndex: 9999,
          border: "2px dashed var(--accent)", 
          boxShadow: "inset 0 0 40px rgba(0, 168, 255, 0.2)",
          borderRadius: "8px", 
          pointerEvents: "none",
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          animation: "pulse 2s infinite"
        }}>
          <div style={{ 
            background: "var(--bg-1)", 
            padding: "16px 32px", 
            borderRadius: "24px", 
            color: "var(--accent)", 
            fontWeight: "bold", 
            fontSize: "13px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.8), 0 0 16px rgba(0, 168, 255, 0.4)",
            border: "1px solid rgba(0, 168, 255, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
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
