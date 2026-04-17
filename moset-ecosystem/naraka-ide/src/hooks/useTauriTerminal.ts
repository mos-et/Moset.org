import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export function useTauriTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [ptyError, setPtyError] = useState<string | null>(null);

  const initTerminal = useCallback(async () => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new Terminal({
      theme: {
        background: 'transparent',
        foreground: '#e2e8f0',
        cursor: '#4facfe',
      },
      fontFamily: "'Fira Code', 'Consolas', monospace",
      fontSize: 14,
      cursorBlink: true,
      allowTransparency: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Listeners desde Tauri
    const unlistenRead = await listen<string>("pty-read", (e) => {
      term.write(e.payload);
    });

    const unlistenError = await listen<string>("pty-error", (e) => {
      console.error("[PTY Tauri Error]:", e.payload);
      setPtyError(e.payload);
      // Escribir el error en la terminal para que sea visual
      term.write(`\r\n\x1b[31;1m[ERROR CRÍTICO DEL SISTEMA]\x1b[0m\r\n`);
      term.write(`\x1b[31mFalló la conexión con el Shell del OS. Detalle:\x1b[0m\r\n`);
      term.write(`${e.payload}\r\n`);
      term.write(`\x1b[33mIntenta verificar si 'powershell.exe' o 'cmd.exe' están instalados y en el PATH.\x1b[0m\r\n`);
    });

    const unlistenExit = await listen<string>("pty-exit", (e) => {
      term.write(`\r\n\x1b[33m[Sesión Terminada: ${e.payload}]\x1b[0m\r\n`);
    });

    term.onData((data) => {
      invoke("write_pty", { data }).catch((err) => 
        console.error("PTY Write Error (Probablemente PTY no inicializó):", err)
      );
    });

    term.onResize(({ cols, rows }) => {
      invoke("resize_pty", { cols, rows }).catch((err) => 
        console.error("PTY Resize Error:", err)
      );
    });

    // Iniciar PTY Backend
    try {
      await invoke("spawn_pty");
    } catch (err: any) {
      setPtyError(err.toString());
    }

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
      }
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      unlistenRead();
      unlistenError();
      unlistenExit();
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cleanupFn: (() => void) | void;
    initTerminal().then(cleanup => {
      if (cleanup) cleanupFn = cleanup;
    });
    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [initTerminal]);

  return { terminalRef, ptyError };
}
