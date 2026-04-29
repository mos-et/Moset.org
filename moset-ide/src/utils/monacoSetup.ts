import { Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";

let isMonacoSetup = false;

export function setupMonaco(monacoInstance: Monaco) {
  if (isMonacoSetup) return;
  isMonacoSetup = true;

  monacoInstance.languages.register({ id: "moset" });

  monacoInstance.languages.setLanguageConfiguration("moset", {
    comments: {
      lineComment: ":@",
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    onEnterRules: [
      {
        // Auto-indentar después de terminar la línea con ":"
        beforeText: /:\s*$/,
        action: { indentAction: monacoInstance.languages.IndentAction.Indent },
      },
    ],
  });

  monacoInstance.languages.setMonarchTokensProvider("moset", {
    keywords: [
      "molde", "devolver", "si", "sino", "mientras",
      "por", "cada", "en", "mostrar", "importar",
      "verdadero", "falso", "nulo", "pensar",
    ],
    typeKeywords: ["Texto", "Entero", "Decimal", "Booleano", "Lista"],
    tokenizer: {
      root: [
        [/(:\,\]|:\,\[|:\,\\)/, "macro"],
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
      { token: "macro",      foreground: "FF9E64", fontStyle: "bold" }, // Naranja vibrante para los macros Moset
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
    triggerCharacters: [".", "@", ","],
    provideCompletionItems(model: any, position: any) {
      const wordInfo = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      const textUntilPosition = lineContent.substring(0, position.column - 1);

      const getRange = (label: string) => {
        // Consumir cualquier prefijo del label que ya esté escrito
        for (let i = label.length; i > 0; i--) {
          const prefix = label.substring(0, i);
          if (textUntilPosition.endsWith(prefix)) {
            return {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - i,
              endColumn: position.column,
            };
          }
        }
        return {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: position.column,
        };
      };

      const suggestions: monaco.languages.CompletionItem[] = [
        {
          label: "....",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ":,\\ ${1:promesa}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,\\ Esperar (async/await)",
          detail: ":,\\ esperar",
          range: getRange("...."),
        },
        {
          label: ",,,,",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ":,\\ ${1:promesa}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,\\ Esperar (async/await)",
          detail: ":,\\ esperar",
          range: getRange(",,,,"),
        },
        {
          label: "...",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ":,[ ${1:error}:\n    ${2:manejo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,[ Catch en línea (manejo de errores)",
          detail: ":,[ catch",
          range: getRange("..."),
        },
        {
          label: ",,,",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ":,[ ${1:error}:\n    ${2:manejo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,[ Catch en línea (manejo de errores)",
          detail: ":,[ catch",
          range: getRange(",,,"),
        },
        {
          label: "..",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ":,] ${1:nombre}(${2:args}):\n    ${3:cuerpo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,] Definir función/rutina en Moset",
          detail: ":,] función",
          range: getRange(".."),
        },
        {
          label: ",,",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ":,] ${1:nombre}(${2:args}):\n    ${3:cuerpo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":,] Definir función/rutina en Moset",
          detail: ":,] función",
          range: getRange(",,"),
        },
        {
          label: "@",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: ":@ ${1:comentario}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: ":@ Comentario en Moset",
          detail: ":@ comentario",
          range: getRange("@"),
        },
        {
          label: "molde",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "molde ${1:Nombre}:\n    ${2:campo}: ${3:Texto}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Definir un Molde (struct)",
          detail: "molde Nombre:",
          range: getRange("molde"),
        },
        {
          label: "si",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "si ${1:condicion}:\n    ${2:cuerpo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Bloque Condicional",
          detail: "si",
          range: getRange("si"),
        },
        {
          label: "mientras",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "mientras ${1:condicion}:\n    ${2:cuerpo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Bucle Mientras",
          detail: "mientras",
          range: getRange("mientras"),
        },
        {
          label: "por cada",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "por cada ${1:item} en ${2:lista}:\n    ${3:cuerpo}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Bucle Iterativo",
          detail: "por cada",
          range: getRange("por cada"),
        },
        {
          label: "pensar",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "pensar {\n    ${1:codigo}\n}",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Shadow Environment - simula sin efectos colaterales",
          detail: "pensar { }",
          range: getRange("pensar"),
        },
        {
          label: "Bit:~",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "Bit:~",
          documentation: "Bit cuántico en superposición 50/50",
          detail: "Bit cuántico",
          range: getRange("Bit:~"),
        },
        {
          label: "Bit:[]",
          kind: monacoInstance.languages.CompletionItemKind.Snippet,
          insertText: "Bit:[${1:0.85}]",
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Bit cuántico sesgado con probabilidad custom",
          detail: "Bit:[prob]",
          range: getRange("Bit:[]"),
        },
      ];

      return { suggestions };
    },
  });

  // Atajo Tab para caritas Moset usando addCommand
  monacoInstance.editor.onDidCreateEditor((editor: any) => {
    editor.addCommand(
      monacoInstance.KeyCode.Tab,
      () => {
        const model = editor.getModel();
        if (!model) return;
        const pos = editor.getPosition();
        if (!pos) return;

        const line = model.getLineContent(pos.lineNumber);
        const before = line.slice(0, pos.column - 1);

        const replacements: [RegExp, string][] = [
          // Cuatro caracteres
          [/[:]?\.\.\.\.$/, ":,\\"],  // .... -> :,\ (Esperar)
          [/[:]?,,,,$/, ":,\\"],      // ,,,, -> :,\

          // Tres caracteres
          [/[:]?\.\.\.$/, ":,["],      // ...  -> :,[ (Catch/Error)
          [/[:]?,,,$/, ":,["],         // ,,,  -> :,[

          // Dos caracteres
          [/[:]?\.\.$/, ":,]"],       // ..   -> :,] (Función)
          [/[:]?,,$/, ":,]"],         // ,,   -> :,]

          // Un solo caracter (Mejora solicitada: , + Tab)
          [/[:]?\.$/, ":,]"],         // .    -> :,]
          [/[:]?\,$/, ":,]"],         // ,    -> :,]

          // Comentarios
          [/[:]?@$/, ":@"],           // @    -> :@
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

        // Fallback: Si no hay match, insertar Tab normal
        editor.trigger("keyboard", "type", { text: "\t" });
      },
      "!suggestWidgetVisible && !inSnippetMode"
    );
  });

  // Inline Completions (AI Autocomplete)
  let _aiDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let _aiModelLoaded = false;

  invoke("autocomplete_soberano", { prefix: "test", suffix: "" })
    .then(() => { _aiModelLoaded = true; })
    .catch(() => { _aiModelLoaded = false; });

  monacoInstance.languages.registerInlineCompletionsProvider("moset", {
    provideInlineCompletions: async (model: any, position: any, _ctx: any, token: any) => {
      if (!_aiModelLoaded) return { items: [] };

      const textUntilPosition = model.getValueInRange({
        startLineNumber: Math.max(1, position.lineNumber - 20),
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });

      const prefix = textUntilPosition.slice(-500);
      if (prefix.trim().length < 5) return { items: [] };

      const textAfterPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 10),
        endColumn: model.getLineMaxColumn(Math.min(model.getLineCount(), position.lineNumber + 10))
      });
      const suffix = textAfterPosition.slice(0, 300);

      return new Promise((resolve) => {
        if (_aiDebounceTimer) clearTimeout(_aiDebounceTimer);
        _aiDebounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) { resolve({ items: [] }); return; }
          try {
            const result: string = await invoke("autocomplete_soberano", { prefix, suffix });
            if (token.isCancellationRequested) { resolve({ items: [] }); return; }
            let clean = result.replace(/<\|fim_[^>]*\|>/g, "").replace(/<\|endoftext\|>/g, "").trimEnd();
            if (!clean) { resolve({ items: [] }); return; }
            resolve({
              items: [{
                insertText: clean,
                range: new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, position.column)
              }]
            });
          } catch {
            resolve({ items: [] });
          }
        }, 800);
      });
    },
    freeInlineCompletions: () => {}
  } as any);
}
