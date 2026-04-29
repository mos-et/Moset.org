import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { Monaco, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useIdeConfig } from "../../hooks/useIdeConfig";
import LENS_DICTIONARIES from "../../languages/lensDictionaries.json";
import "../../styles/lens.css";

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
  const ideConfig = useIdeConfig();
  
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationCollectionRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  // Counter to force lens re-application after editor mounts
  const [editorReady, setEditorReady] = useState(0);

  const handleMount = (editor: monaco.editor.IStandaloneCodeEditor, m: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = m;
    // Signal that editor is ready — triggers lens useEffect
    setEditorReady(prev => prev + 1);
    if (onMount) onMount(editor, m);
  };

  // Stable lens application function
  const applyLens = useCallback(() => {
    const editor = editorRef.current;
    const monacoInstance = monacoRef.current;
    if (!editor || !monacoInstance) return;

    // Clear existing decorations
    if (decorationCollectionRef.current) {
      decorationCollectionRef.current.clear();
      decorationCollectionRef.current = null;
    }

    // Exit if lens is disabled or not a Moset file
    if (!ideConfig.useLocalizationLens || currentLanguage !== "moset") {
      return;
    }

    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const dictionary = (LENS_DICTIONARIES as Record<string, Record<string, string>>)[ideConfig.lensLanguage] 
      || (LENS_DICTIONARIES as Record<string, Record<string, string>>)["en"];

    const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];

    for (const [es, target] of Object.entries(dictionary)) {
      const regex = new RegExp(`\\b${es}\\b`, "g");
      let match;
      while ((match = regex.exec(text)) !== null) {
        const startPos = model.getPositionAt(match.index);
        const endPos = model.getPositionAt(match.index + match[0].length);
        
        newDecorations.push({
          range: new monacoInstance.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
          options: {
            inlineClassName: 'moset-lens-hidden',
            after: {
              content: target,
              inlineClassName: 'moset-lens-projected'
            }
          }
        });
      }
    }

    if (newDecorations.length > 0) {
      decorationCollectionRef.current = editor.createDecorationsCollection(newDecorations);
    }
  }, [ideConfig.useLocalizationLens, ideConfig.lensLanguage, currentLanguage]);

  // Motor de Traducción Visual (Projectional Lens)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    applyLens();
    
    let debounceTimer: ReturnType<typeof setTimeout>;
    const disposable = editor.onDidChangeModelContent(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyLens();
      }, 200);
    });

    return () => {
      clearTimeout(debounceTimer);
      disposable.dispose();
    };
  }, [applyLens, editorReady, content]);

  return (
    <div style={{ flex: 1, height: "100%", width: "100%", overflow: "hidden", position: "relative" }}>
      <Editor
        theme="mosetTheme"
        language={currentLanguage}
        value={content}
        onChange={onChange}
        onMount={handleMount}
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

