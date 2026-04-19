export function StatusBar({ file, lang, projectRoot, saved, cursorPos }: {
  file: string;
  lang: string;
  projectRoot: string | null;
  saved: boolean;
  cursorPos: { lineNumber: number; column: number };
}) {
  const projectName = projectRoot
    ? projectRoot.replace(/\\/g, "/").split("/").pop() ?? "proyecto"
    : null;

  return (
    <div className="status-bar">
      <div className="status-left">
        {projectName && <span className="status-item status-project">📦 {projectName}</span>}
        <span className="status-item">⛩️ Moset IDE v0.2</span>
      </div>
      <div className="status-right">
        {file && <span className={`status-item ${saved ? "" : "status-unsaved"}`}>{file}{saved ? "" : " 🟢"}</span>}
        {lang && <span className="status-item">{lang.toUpperCase()}</span>}
        <span className="status-item">UTF-8</span>
        <span className="status-item">Ln {cursorPos.lineNumber}, Col {cursorPos.column}</span>
      </div>
    </div>
  );
}
