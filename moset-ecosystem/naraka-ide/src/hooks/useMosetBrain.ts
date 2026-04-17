import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

export interface ExecutionResult {
  output: string;
  thinkBlock?: string;
}

export function useMosetBrain() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Filtro cuántico para DeepSeek/Mistral
  const parseAiOutput = (rawOutput: string): ExecutionResult => {
    let thinkBlock: string | undefined = undefined;
    let finalOutput = rawOutput;

    // Detectar si el modelo inyectó un bloque de pensamiento
    const thinkStart = rawOutput.indexOf("<think>");
    const thinkEnd = rawOutput.indexOf("</think>");

    if (thinkStart !== -1 && thinkEnd !== -1) {
      thinkBlock = rawOutput.slice(thinkStart + 7, thinkEnd).trim();
      finalOutput = rawOutput.slice(thinkEnd + 8).trim();
    } else if (thinkStart !== -1) {
      // Pensamiento inacabado
      thinkBlock = rawOutput.slice(thinkStart + 7).trim();
      finalOutput = ""; // Todavía no hay output final
    }

    return { output: finalOutput, thinkBlock };
  };

  const ejecutarCodigo = useCallback(async (codigo: string, dialecto: string): Promise<void> => {
    setIsExecuting(true);
    try {
      // 1. Notificar a la UI
      await emit("pty-read", "\r\n\x1b[36m[MOS-MOTOR] Iniciando secuencia de ejecución...\x1b[0m\r\n");
      await emit("pty-read", `\x1b[34m[SISTEMA] Cargando entorno Soberano (${dialecto || 'es'})...\x1b[0m\r\n`);

      // 2. Invocar backend Rust
      const rawResult: string = await invoke("ejecutar", { codigo, idioma: dialecto });
      
      // 3. Evaluar e interceptar respuestas crudas si el output es IA
      const { output, thinkBlock } = parseAiOutput(rawResult);

      if (thinkBlock) {
        await emit("pty-read", `\r\n\x1b[35m[RAZONAMIENTO IA (DeepSeek/Mistral)]:\r\n${thinkBlock}\x1b[0m\r\n`);
      }

      await emit("pty-read", `\r\n\x1b[1;32mOUTPUT:\x1b[0m\r\n${output}\r\n`);
      await emit("pty-read", "\x1b[36m[EXIT] Proceso finalizado con éxito.\x1b[0m\r\n");

    } catch (e: any) {
      const errorMsg = typeof e === "string" ? e : e?.message || String(e);
      await emit("pty-read", `\r\n\x1b[1;31m[ERROR] Fallo en la matriz:\r\n${errorMsg}\x1b[0m\r\n`);
      console.error("Error ejecutando:", e);
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const autocompleteSoberano = useCallback(async (prefix: string, suffix: string): Promise<string> => {
    setIsAiLoading(true);
    try {
      const rawResult: string = await invoke("autocomplete_soberano", { prefix, suffix });
      
      // Limpieza de tokens de finalización
      let clean = rawResult.replace(/<\|fim_[^>]*\|>/g, "").replace(/<\|endoftext\|>/g, "").trimEnd();
      
      // Separar tags <think> para que no se inserten bruscamente en el código
      const { output } = parseAiOutput(clean);
      return output;
    } catch (err) {
      console.error("No se pudo autocompletar:", err);
      return "";
    } finally {
      setIsAiLoading(false);
    }
  }, []);

  const pingSoberano = useCallback(async (): Promise<boolean> => {
    try {
      await invoke("autocomplete_soberano", { prefix: "test", suffix: "" });
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    ejecutarCodigo,
    autocompleteSoberano,
    pingSoberano,
    isExecuting,
    isAiLoading,
    parseAiOutput
  };
}
