use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct PtyState {
    pub writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    pub child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>>,
    pub master: Arc<Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>>,
}

#[tauri::command]
pub fn write_pty(state: State<'_, PtyState>, data: String) -> Result<(), String> {
    let mut writer_guard = state.writer.lock().map_err(|e| format!("Mutex envenenado (writer): {}", e))?;
    if let Some(writer) = writer_guard.as_mut() {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Error escribiendo en PTY: {}", e))?;
    } else {
        return Err("PTY no inicializada. No hay writer activo.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn resize_pty(state: State<'_, PtyState>, rows: u16, cols: u16) -> Result<(), String> {
    let mut master_guard = state.master.lock().map_err(|e| format!("Mutex envenenado (master): {}", e))?;
    if let Some(master) = master_guard.as_mut() {
        let size = portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        master.resize(size).map_err(|e| format!("Fallo al redimensionar PTY: {}", e))?;
    }
    Ok(())
}

/// BUG-020: Comando para matar el proceso PTY de forma limpia desde el frontend.
#[tauri::command]
pub fn kill_pty(state: State<'_, PtyState>) -> Result<String, String> {
    // 1. Cerrar el writer para que el shell no reciba más input
    if let Ok(mut writer_guard) = state.writer.lock() {
        *writer_guard = None;
    }
    // 2. Matar el proceso child
    if let Ok(mut child_guard) = state.child.lock() {
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            return Ok("PTY terminada correctamente.".into());
        }
    }
    Ok("No había PTY activa.".into())
}

#[tauri::command]
pub fn spawn_pty(app: AppHandle) -> Result<String, String> {
    let pty_system = NativePtySystem::default();
    let size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    
    // BUG-018: Reemplazar expect() por manejo graceful de errores
    let pair = match pty_system.openpty(size) {
        Ok(pair) => pair,
        Err(e) => {
            let msg = format!("Fallo al inicializar PTY: {}", e);
            let _ = app.emit("pty-error", &msg);
            return Err(msg);
        }
    };

    let mut cmd = CommandBuilder::new("powershell.exe");
    cmd.args(["-NoLogo", "-WindowStyle", "Hidden"]);
    
    let child = match pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(_) => {
            // BUGFIX: Si powershell.exe no existe, intentamos con cmd.exe como fallback
            let cmd2 = CommandBuilder::new("cmd.exe");
            match pair.slave.spawn_command(cmd2) {
                Ok(child_fallback) => child_fallback,
                Err(e2) => {
                    let msg = format!("Fallo al iniciar PowerShell y CMD: {}", e2);
                    let _ = app.emit("pty-error", &msg);
                    return Err(msg);
                }
            }
        }
    };
    
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("Fallo obteniendo reader PTY: {}", e);
            let _ = app.emit("pty-error", &msg);
            return Err(msg);
        }
    };
    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            let msg = format!("Fallo obteniendo writer PTY: {}", e);
            let _ = app.emit("pty-error", &msg);
            return Err(msg);
        }
    };

    // BUG-018: Usar map_err en vez de unwrap para mutex poisoned
    let state: State<'_, PtyState> = app.state();
    if let Ok(mut writer_guard) = state.writer.lock() {
        *writer_guard = Some(writer);
    }
    if let Ok(mut child_guard) = state.child.lock() {
        *child_guard = Some(child);
    }
    if let Ok(mut master_guard) = state.master.lock() {
        *master_guard = Some(pair.master);
    }

    // BUG-019: El reader thread notifica al frontend cuando el PTY muere
    let mut reader = reader;
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096]; // Incrementado de 1024 a 4096 para mejor throughput
        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit("pty-read", text);
                }
                Ok(_) => {
                    // EOF: el child cerró su stdout
                    let _ = app.emit("pty-exit", "Shell terminó normalmente.".to_string());
                    break;
                }
                Err(e) => {
                    let _ = app.emit("pty-exit", format!("Shell terminó: {}", e));
                    break;
                }
            }
        }
        
        // BUG-020: Reap the child process to avoid zombies
        let state: State<'_, PtyState> = app.state();
        if let Ok(mut child_guard) = state.child.lock() {
            if let Some(mut child) = child_guard.take() {
                let _ = child.wait();
            }
        };
    });

    Ok("Terminado".into())
}
