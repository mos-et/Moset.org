import type { Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
let isMonacoSetup = false;

export function setupMonaco(monacoInstance: Monaco) {
  if (isMonacoSetup) return;
  isMonacoSetup = true;

  monacoInstance.languages.register({ id: "moset" });

  monacoInstance.languages.setMonarchTokensProvider("moset", {
    keywords: [
      "molde", "devolver", "si", "sino", "mientras",
      "por", "cada", "en", "mostrar", "importar",
      "verdadero", "falso", "nulo", "pensar",
    ],
    typeKeywords: ["Texto", "Entero", "Decimal", "Booleano", "Lista"],
    tokenizer: {
      root: [
        [/:@.*$/, "comment"],
        [/\/\/.*$/, "comment"],
        [/"[^"]*"/, "string"],
        [/\b\d+(\.\d+)?\b/, "number"],
        [/\b(molde|devolver|si|sino|mientras|por|cada|en|mostrar|importar|verdadero|falso|nulo|pensar)\b/, "keyword"],
        [/\b(Texto|Entero|Decimal|Booleano|Lista)\b/, "type"],
        [/[a-zA-Z_]\w*/, "identifier"],
        [/[{}()[\]]/, "delimiter.bracket"],
        [/[+\-*\/=<>!]+/, "operator"],
      ],
    },
  });

  monacoInstance.editor.defineTheme("moset-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword",    foreground: "00A8FF", fontStyle: "bold" },
      { token: "type",       foreground: "00E5A0" },
      { token: "string",     foreground: "8BC4E8" },
      { token: "comment",    foreground: "3D4A6B", fontStyle: "italic" },
      { token: "number",     foreground: "7CB9FF" },
      { token: "operator",   foreground: "8899BB" },
      { token: "identifier", foreground: "DCE4F5" },
    ],
    colors: {
      "editor.background":                 "#070810",
      "editor.foreground":                 "#DCE4F5",
      "editorLineNumber.foreground":       "#252840",
      "editorLineNumber.activeForeground": "#8899BB",
      "editor.selectionBackground":        "#00A8FF22",
      "editor.lineHighlightBackground":    "#10121E",
      "editorCursor.foreground":           "#00A8FF",
      "editorWhitespace.foreground":       "#181B2A",
    },
  });

  // Tab Snippets para Moset
  monacoInstance.languages.registerCompletionItemProvider("moset", {
    triggerCharacters: [".", "@"],
    provideCompletionItems(model: any, position: any) {
      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: position.column,
      };

      const suggestions: monaco.languages.CompletionItem[] = [
        {
          label: "..",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ",] ${1:nombre}(${2:args}):\n    ${3:cuerpo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,] Definir función/rutina en Moset",
          detail: ":,] función",
          range,
        },
        {
          label: "...",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ",[ ${1:error}:\n    ${2:manejo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,[ Catch en línea (manejo de errores)",
          detail: ":,[ catch",
          range,
        },
        {
          label: "....",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ",\\ ${1:promesa}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,\\ Esperar (async/await)",
          detail: ":,\\ esperar",
          range,
        },
        {
          label: "@",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "@ ${1:comentario}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":@ Comentario en Moset",
          detail: ":@ comentario",
          range,
        },
        {
          label: "molde",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "molde ${1:Nombre}:\n    ${2:campo}: ${3:Texto}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Definir un Molde (struct)",
          detail: "molde Nombre:",
          range,
        },
        {
          label: "pensar",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "pensar {\n    ${1:codigo}\n}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Shadow Environment - simula sin efectos colaterales",
          detail: "pensar { }",
          range,
        },
        {
          label: "Bit:~",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "Bit:~",
          documentation: "Bit cuántico en superposición 50/50",
          detail: "Bit cuántico",
          range,
        },
        {
          label: "Bit:[]",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "Bit:[${1:0.85}]",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Bit cuántico sesgado con probabilidad custom",
          detail: "Bit:[prob]",
          range,
        },
      ];

      return { suggestions };
    },
  });

  // Atajo Tab para caritas Moset
  monacoInstance.editor.addEditorAction({
    id: "moset.tab-snippet",
    label: "Moset: Insertar carita",
    keybindings: [monacoInstance.KeyCode.Tab],
    precondition: undefined,
    run(editor: any) {
      const model = editor.getModel();
      if (!model) return;
      const pos = editor.getPosition();
      if (!pos) return;

      const line = model.getLineContent(pos.lineNumber);
      const before = line.slice(0, pos.column - 1);

      const replacements: [RegExp, string][] = [
        [/:\.\.\.\.$/, ":,\\"],   // :.... -> :,\
        [/:\.\.\.$/, ":["],       // :...  -> :[
        [/:\.\.$/, ":,]"],        // :..   -> :,]
        [/:@$/, ":@"],            // :@    -> :@
      ];

      for (const [pattern, replacement] of replacements) {
        const m = before.match(pattern);
        if (m) {
          const start = pos.column - m[0].length;
          editor.executeEdits("moset-snippet", [{
            range: new monacoInstance.Range(
              pos.lineNumber, start,
              pos.lineNumber, pos.column
            ),
            text: replacement,
          }]);
          return;
        }
      }

      editor.trigger("keyboard", "tab", {});
    },
  });

  // Inline Completions (AI Autocomplete)
  // Disabled in Web Playground as it requires native Tauri backend
  /*
  let _aiDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let _aiModelLoaded = false;
  */
}
