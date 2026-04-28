
import Editor, { Monaco, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Ensure local monaco initialization
loader.config({ monaco });

interface CodeEditorProps {
  language: string;
  content: string;
  onChange: (value: string | undefined) => void;
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  
}

export function CodeEditor({ language, content, onChange, onMount }: CodeEditorProps) {
  const currentLanguage = language === "moset" ? "moset" : (language || "plaintext");

  return (
    <div style={{ flex: 1, height: "100%", width: "100%", overflow: "hidden", position: "relative" }}>
      <Editor
        theme="mosetTheme"
        language={currentLanguage}
        value={content}
        onChange={onChange}
        onMount={onMount}
        options={{
          fontFamily: "'Fira Code', 'Consolas', monospace",
          fontSize: 14,
          fontLigatures: true,
          minimap: { enabled: true },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          padding: { top: 16 },
          roundedSelection: true,
          scrollBeyondLastLine: false,
          formatOnPaste: true,
          suggest: {
            showIcons: false,
            showStatusBar: false,
            preview: true
          },
          inlineSuggest: { 
            enabled: true,
            showToolbar: "always"
          }
        }}
      />
    </div>
  );
}


