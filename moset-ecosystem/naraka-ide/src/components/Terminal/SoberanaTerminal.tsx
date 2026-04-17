
import { useTauriTerminal } from "../../hooks/useTauriTerminal";
import "../../styles/index.css"; // Ensure styles are pulled appropriately if decoupled

export function SoberanaTerminal() {
  const { terminalRef, ptyError } = useTauriTerminal();

  return (
    <div className="terminal">
      <div className="terminal-header">
        <span>MOSET PTY</span>
        <span className="terminal-tabs">
          <span className="terminal-tab active">powershell</span>
        </span>
      </div>
      <div className="terminal-body pty-container" style={{ position: 'relative', width: "100%", height: "100%" }}>
        <div 
          ref={terminalRef} 
          style={{ width: "100%", height: "100%", paddingLeft: "8px", boxSizing: "border-box" }}
        />
        {ptyError && (
          <div style={{
            position: "absolute",
            top: "10px", right: "10px",
            background: "rgba(255,0,0,0.8)",
            color: "white", padding: "10px",
            borderRadius: "5px", zIndex: 10
          }}>
            <b>ERROR DEL SISTEMA:</b> {ptyError}
          </div>
        )}
      </div>
    </div>
  );
}

