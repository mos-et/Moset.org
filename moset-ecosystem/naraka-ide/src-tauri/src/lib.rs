// ─── Moset IDE - Tauri Backend ────────────────────────────────────────────────
// Motor Soberano v0.2 | Moset Studio
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn version() -> String {
    "Moset IDE v0.2 | Motor Soberano | Moset Studio".to_string()
}

#[tauri::command]
async fn ejecutar(_app: tauri::AppHandle, codigo: String, idioma: Option<String>) -> Result<String, String> {
    use moset_core::{lexer::Lexer, parser::Parser, compiler::Compilador, vm::VM};
    use std::sync::{Arc, Mutex};

    let output = Arc::new(Mutex::new(String::new()));
    let output_clone = Arc::clone(&output);

    let mut lex = Lexer::nuevo(&codigo, idioma.as_deref());
    let tokens = match lex.tokenizar() {
        Ok(t) => t,
        Err(e) => return Err(format!("Error léxico: {}", e)),
    };

    let mut par = Parser::nuevo(tokens);
    let programa = match par.parsear() {
        Ok(p) => p,
        Err(e) => return Err(format!("Error de sintaxis: {}", e)),
    };

    let mut compilador = Compilador::nuevo();
    if let Err(e) = compilador.compilar_programa(&programa) {
        return Err(format!("Error de compilación: {}", e));
    }

    let mut maquina = VM::nueva(compilador.chunk);
    
    // Capturar mostrar() en el buffer
    maquina.on_print = Some(Box::new(move |s| {
        if let Ok(mut guard) = output_clone.lock() {
            guard.push_str(s);
            guard.push('\n');
        }
    }));

    match maquina.ejecutar() {
        Ok(res) => {
            let guard = output.lock().unwrap();
            if guard.is_empty() {
                Ok(res.to_string())
            } else {
                Ok(guard.clone())
            }
        },
        Err(e) => Err(format!("Error de ejecución: {}", e)),
    }
}

#[tauri::command]
fn validate_code(codigo: String) -> Vec<moset_core::linter::Diagnostic> {
    use moset_core::{lexer::Lexer, parser::Parser, linter::Linter};

    let mut lex = Lexer::nuevo(&codigo, Some("es"));
    let tokens = match lex.tokenizar() {
        Ok(t) => t,
        Err(e) => {
            return vec![moset_core::linter::Diagnostic {
                linea: 1,
                columna: 1,
                mensaje: format!("Error léxico: {}", e),
                severidad: moset_core::linter::Severidad::Error,
            }];
        }
    };

    let mut par = Parser::nuevo(tokens);
    let programa = match par.parsear() {
        Ok(p) => p,
        Err(e) => {
             return vec![moset_core::linter::Diagnostic {
                 linea: 1,
                 columna: 1,
                 mensaje: format!("SyntaxError: {}", e),
                 severidad: moset_core::linter::Severidad::Error,
             }];
        }
    };

    let mut linter = Linter::nuevo();
    linter.analizar(&programa)
}

// ─── Filesystem commands ─────────────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
struct FsTreeNode {
    id: String,
    name: String,
    #[serde(rename = "type")]
    node_type: String, // "file" | "folder"
    children: Option<Vec<FsTreeNode>>,
}

#[derive(serde::Serialize)]
struct SearchResult {
    file: String,
    line: usize,
    content: String,
}

#[tauri::command]
fn search_workspace(path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();
    let q = query.to_lowercase();
    
    fn search_dir(dir: std::path::PathBuf, q: &str, results: &mut Vec<SearchResult>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name != "node_modules" && name != "target" && name != ".git" && name != "dist" {
                        search_dir(p, q, results);
                    }
                } else {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        for (i, line) in content.lines().enumerate() {
                            if line.to_lowercase().contains(q) {
                                results.push(SearchResult {
                                    file: p.to_string_lossy().replace("\\", "/"),
                                    line: i + 1,
                                    content: line.trim().to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    
    search_dir(std::path::PathBuf::from(path), &q, &mut results);
    Ok(results)
}


#[tauri::command]
fn read_directory(path: String, max_depth: Option<u32>) -> Result<Vec<FsTreeNode>, String> {
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err(format!("No es un directorio: {}", path));
    }
    let depth = max_depth.unwrap_or(3);
    Ok(walk_dir(root, root, depth))
}

fn walk_dir(base: &std::path::Path, dir: &std::path::Path, depth: u32) -> Vec<FsTreeNode> {
    if depth == 0 { return vec![]; }

    let mut entries: Vec<FsTreeNode> = Vec::new();
    let Ok(read_dir) = std::fs::read_dir(dir) else { return entries };

    let mut items: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
    items.sort_by(|a, b| {
        let a_dir = a.file_type().map(|f| f.is_dir()).unwrap_or(false);
        let b_dir = b.file_type().map(|f| f.is_dir()).unwrap_or(false);
        b_dir.cmp(&a_dir).then(a.file_name().cmp(&b.file_name()))
    });

    for entry in items {
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden/internal directories
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "__pycache__" || name == "dist" {
            continue;
        }

        let full_path = entry.path();
        let rel_path = full_path.strip_prefix(base).unwrap_or(&full_path);
        let id = rel_path.to_string_lossy().replace('\\', "/");

        if entry.file_type().map(|f| f.is_dir()).unwrap_or(false) {
            let children = walk_dir(base, &full_path, depth - 1);
            entries.push(FsTreeNode {
                id,
                name,
                node_type: "folder".into(),
                children: Some(children),
            });
        } else {
            entries.push(FsTreeNode {
                id,
                name,
                node_type: "file".into(),
                children: None,
            });
        }
    }
    entries
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo {}: {}", path, e))
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    let vigilante = moset_core::vigilante::Vigilante::nuevo();
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;
    std::fs::File::create(&path)
        .map(|_| ())
        .map_err(|e| format!("Error creando archivo {}: {}", path, e))
}

#[tauri::command]
fn create_folder(path: String) -> Result<(), String> {
    let vigilante = moset_core::vigilante::Vigilante::nuevo();
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Error creando carpeta {}: {}", path, e))
}

#[tauri::command]
fn delete_item(path: String) -> Result<(), String> {
    let vigilante = moset_core::vigilante::Vigilante::nuevo();
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p)
            .map_err(|e| format!("Error borrando carpeta {}: {}", path, e))
    } else {
        std::fs::remove_file(p)
            .map_err(|e| format!("Error borrando archivo {}: {}", path, e))
    }
}

#[tauri::command]
fn rename_item(old_path: String, new_path: String) -> Result<(), String> {
    let vigilante = moset_core::vigilante::Vigilante::nuevo();
    vigilante.autorizar_ruta(&old_path).map_err(|e| format!("Vigilante: Acceso denegado (origen): {}", e))?;
    vigilante.autorizar_ruta(&new_path).map_err(|e| format!("Vigilante: Acceso denegado (destino): {}", e))?;
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Error renombrando de {} a {}: {}", old_path, new_path, e))
}

#[tauri::command]
fn save_file_content(path: String, content: String) -> Result<(), String> {
    let vigilante = moset_core::vigilante::Vigilante::nuevo();
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;
    std::fs::write(&path, &content)
        .map_err(|e| format!("Error guardando {}: {}", path, e))
}

#[derive(Clone)]
struct ContextChunk {
    file_path: String,
    content: String,
    score: f32,
}

#[tauri::command]
fn fetch_full_context(paths: Vec<String>, query: Option<String>) -> Result<String, String> {
    const MAX_CHARS: usize = 10000;
    
    let valid_extensions = ["et", "rs", "ts", "tsx", "js", "jsx", "md", "json", "toml", "css", "py", "html", "sh"];
    let ignore_dirs = ["node_modules", ".git", "target", "dist", "build"];
    
    let mut all_chunks: Vec<ContextChunk> = Vec::new();
    
    // Función auxiliar para extraer palabras de un texto
    fn extract_words(text: &str) -> Vec<String> {
        text.split(|c: char| !c.is_alphanumeric())
            .filter(|s| s.len() > 2)
            .map(|s| s.to_lowercase())
            .collect()
    }
    
    let query_words = query.as_ref().map(|q| extract_words(q)).unwrap_or_default();

    fn process_path(
        path: &std::path::Path, 
        base_path: &std::path::Path,
        chunks: &mut Vec<ContextChunk>, 
        query_words: &[String],
        valid_extensions: &[&str],
        ignore_dirs: &[&str]
    ) {
        let path_str = path.to_string_lossy().replace("\\", "/");
        if ignore_dirs.iter().any(|d| path_str.contains(&format!("/{}", d)) || path_str.ends_with(d)) {
            return;
        }

        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let rel_path = path.strip_prefix(base_path).unwrap_or(path).to_string_lossy().to_string();
                        
                        // Dividir el archivo en trozos (por ejemplo, bloques separados por dobles saltos de línea o simplemente bloques fijos)
                        // Para simplificar: tomaremos todo el archivo como un chunk, pero si es muy grande, le damos su propio score
                        let score = if query_words.is_empty() {
                            // Sin query explícita, los archivos más pequeños (o en orden) tienen más o igual prioridad
                            1.0
                        } else {
                            let content_words = extract_words(&content);
                            let mut match_count = 0;
                            for qw in query_words {
                                if content_words.contains(qw) {
                                    match_count += 1;
                                }
                            }
                            // Score básico: cantidad de matches, normalizado o potenciado por densidad
                            match_count as f32
                        };

                        chunks.push(ContextChunk {
                            file_path: rel_path,
                            content,
                            score,
                        });
                    }
                }
            }
        } else if path.is_dir() {
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.filter_map(Result::ok) {
                    process_path(&entry.path(), base_path, chunks, query_words, valid_extensions, ignore_dirs);
                }
            }
        }
    }

    for p in paths {
        let path = std::path::Path::new(&p);
        let base_path = if path.is_file() { path.parent().unwrap_or(path) } else { path };
        process_path(path, base_path, &mut all_chunks, &query_words, &valid_extensions, &ignore_dirs);
    }
    
    // Sort chunks by score (descending)
    all_chunks.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    let mut total_chars = 0;
    let mut output = String::new();
    
    for chunk in all_chunks {
        if total_chars >= MAX_CHARS { break; }
        
        output.push_str(&format!("\n--- Archivo: {} (Relevancia: {}) ---\n", chunk.file_path, chunk.score));
        
        let remaining = MAX_CHARS.saturating_sub(total_chars);
        let content_len = chunk.content.chars().count();
        
        if content_len > remaining {
            let truncated: String = chunk.content.chars().take(remaining).collect();
            output.push_str(&truncated);
            output.push_str("\n...[Contenido Truncado por RAG]...\n");
            total_chars += remaining;
        } else {
            output.push_str(&chunk.content);
            output.push_str("\n");
            total_chars += content_len;
        }
    }
    
    if total_chars >= MAX_CHARS {
        output.push_str("\n... [Contexto RAG truncado por límite de seguridad global]");
    }
    
    Ok(output)
}

// ─── Agente Autónomo ─────────────────────────────────────────────────────────

#[tauri::command]
async fn execute_agent_tool(call: moset_core::agent::ToolCall) -> Result<String, String> {
    // ─── Vigilante: middleware de seguridad del Agente ────────────────────────
    // Todas las operaciones de escritura y ejecución pasan por el Vigilante
    // antes de ser ejecutadas. Esto cierra el BUG-043.
    let vigilante = moset_core::vigilante::Vigilante::nuevo();

    match call.tool.as_str() {
        "read_directory" => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("./").to_string();
            let res = read_directory(path, Some(3))?;
            Ok(serde_json::to_string(&res).unwrap_or_else(|_| "[]".to_string()))
        },
        "read_file" => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            read_file_content(path)
        },
        "write_to_file" => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let content = call.args.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();

            // 🛡️ Vigilante: verificar que la ruta está dentro del sandbox
            vigilante.autorizar_ruta(&path)
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            save_file_content(path.clone(), content)?;
            Ok(format!("Archivo {} guardado correctamente.", path))
        },
        "replace_file_content" => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let target = call.args.get("targetContent").and_then(|v| v.as_str()).unwrap_or("");
            let replacement = call.args.get("replacementContent").and_then(|v| v.as_str()).unwrap_or("");

            // 🛡️ Vigilante: verificar sandbox antes de leer/escribir
            vigilante.autorizar_ruta(&path)
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            let current_content = read_file_content(path.clone())?;
            if !current_content.contains(target) {
                return Err(format!("No se encontró el texto objetivo en {}. Revisa que el código coincida exactamente (incluyendo los espacios).", path));
            }
            
            let new_content = current_content.replace(target, replacement);
            save_file_content(path.clone(), new_content)?;
            Ok(format!("Archivo {} modificado correctamente utilizando bloques de reemplazo.", path))
        },
        "search_workspace" => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("./").to_string();
            let query = call.args.get("query").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let res = search_workspace(path, query)?;
            Ok(serde_json::to_string(&res).unwrap_or_else(|_| "[]".to_string()))
        },
        "run_command" => {
            let cmd = call.args.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();

            // 🛡️ Vigilante: auditar el comando antes de ejecutarlo.
            // El agente autónomo opera sin confianza implícita (None).
            // Comandos peligrosos/cautelosos son bloqueados a menos que
            // el código Moset del usuario suministre un Bit explícito.
            vigilante.autorizar(&cmd, None)
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            #[cfg(target_os = "windows")]
            let output = std::process::Command::new("powershell")
                .arg("-Command").arg(&cmd).output();

            #[cfg(not(target_os = "windows"))]
            let output = std::process::Command::new("sh")
                .arg("-c").arg(&cmd).output();

            match output {
                Ok(out) => {
                    let mut result = String::from_utf8_lossy(&out.stdout).to_string();
                    let err = String::from_utf8_lossy(&out.stderr).to_string();
                    if !err.is_empty() {
                        result.push_str("\n--- Error/StdErr ---\n");
                        result.push_str(&err);
                    }
                    if result.trim().is_empty() {
                        Ok("Comando ejecutado sin salida en terminal.".to_string())
                    } else {
                        Ok(result)
                    }
                },
                Err(e) => Err(format!("Error ejecutando comando: {}", e))
            }
        },
        _ => Err(format!("Herramienta desconocida: {}", call.tool))
    }
}

struct AiState {
    motor: Arc<Mutex<moset_core::ai::MotorNaraka>>,
    cancel_flag: Arc<std::sync::atomic::AtomicBool>,
    clean_cuda_on_exit: Arc<std::sync::atomic::AtomicBool>,
}

#[tauri::command]
fn set_clean_cuda_on_exit(state: tauri::State<'_, AiState>, enabled: bool) {
    state.clean_cuda_on_exit.store(enabled, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
async fn cargar_modelo(
    state: tauri::State<'_, AiState>,
    modelo_path: String,
    tokenizer_path: String,
) -> Result<String, String> {
    let motor_clone = Arc::clone(&state.motor);
    tauri::async_runtime::spawn_blocking(move || {
        let mut motor = motor_clone.lock().map_err(|_| "Deadlock al bloquear MotorNaraka")?;
        motor.cargar_tokenizer(&tokenizer_path)?;
        motor.cargar_gguf(&modelo_path)
    })
    .await
    .map_err(|e| format!("Error en el hilo asíncrono: {}", e))?
}

#[tauri::command]
fn cancel_inference(state: tauri::State<'_, AiState>) {
    state.cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
fn descargar_modelo(state: tauri::State<'_, AiState>) -> Result<String, String> {
    let mut motor = state.motor.lock().map_err(|_| "Deadlock al bloquear Motor Soberano")?;
    motor.descargar();
    Ok("Modelo descargado. RAM/VRAM liberada.".to_string())
}

#[tauri::command]
async fn chat_soberano(
    state: tauri::State<'_, AiState>,
    window: tauri::Window,
    prompt: String,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let motor_clone = Arc::clone(&state.motor);
    let cancel_flag = Arc::clone(&state.cancel_flag);
    let tokens_limit = max_tokens.unwrap_or(2048) as usize;
    
    // Reset flag antes de empezar
    cancel_flag.store(false, std::sync::atomic::Ordering::Relaxed);
    
    tauri::async_runtime::spawn_blocking(move || {
        let mut motor = motor_clone.lock().map_err(|_| "Deadlock al bloquear Motor Soberano")?;
        let res = motor.inferir(&prompt, tokens_limit, |partial| {
            // Emite cada token a la UI a traves del channel
            window.emit("soberano-stream", partial).ok();
            
            // Retorna false si se debe cancelar
            !cancel_flag.load(std::sync::atomic::Ordering::Relaxed)
        }).map_err(|e| format!("Error en Motor Soberano: {}", e))?;

        let (text, prompt_len, gen_len) = res;
        
        #[derive(serde::Serialize, Clone)]
        struct SoberanoMetrics {
            prompt_eval_count: usize,
            eval_count: usize,
        }
        
        window.emit("soberano-metrics", SoberanoMetrics {
            prompt_eval_count: prompt_len,
            eval_count: gen_len,
        }).ok();

        Ok(text)
    })
    .await
    .map_err(|e| format!("Error en el hilo asíncrono: {}", e))?
}

#[tauri::command]
async fn chat_orquestado(
    state: tauri::State<'_, AiState>,
    window: tauri::Window,
    messages: Vec<moset_core::cloud_ai::Mensaje>,
    provider: String,
    model: String,
    api_key: String,
    base_url: Option<String>,
    agent_mode: String,
    include_context: bool,
    context_content: String,
    project_root: String,
    max_tokens: Option<u32>,
    q_collapse_method: Option<String>,
    q_alpha: Option<f32>,
    q_entanglement: Option<bool>,
    q_pensar: Option<bool>,
) -> Result<String, String> {
    let cancel_flag = Arc::clone(&state.cancel_flag);
    cancel_flag.store(false, std::sync::atomic::Ordering::Relaxed);

    // ─── Mapeo Cuántico ───────────────────────────────────────────────────────
    // alpha (amplitud del estado |0⟩) → temperature del modelo
    // determinístico → temperature 0.0 (colapso determinista, 1 respuesta)
    // probabilístico → temperature = alpha (Born Rule: P=α², α≈0.7071 → T≈0.71)
    // ai_assisted → temperature = alpha + 0.1 (motor decide con más libertad)
    let collapse = q_collapse_method.as_deref().unwrap_or("probabilistic");
    let alpha = q_alpha.unwrap_or(0.7071_f32).clamp(0.0, 1.0);
    let pensar_mode = q_pensar.unwrap_or(true);
    let _entanglement = q_entanglement.unwrap_or(false); // reservado para correlación futura entre bits

    let temperature: f32 = match collapse {
        "deterministic" => 0.0,
        "ai_assisted"   => (alpha + 0.1).min(1.0),
        _               => alpha, // probabilistic: T = α
    };

    let ctx = if include_context { Some(context_content.as_str()) } else { None };
    let mut sys_prompt = moset_core::agent::generar_system_prompt(&agent_mode, &project_root, ctx);

    // Pensar Mode: fuerza razonamiento interno extendido antes de responder
    if pensar_mode {
        sys_prompt = format!(
            "Antes de cada respuesta, razona internamente con <think>...</think>. Sé exhaustivo en tu análisis, luego da la respuesta limpia fuera del bloque think.\n\n{}",
            sys_prompt
        );
    }

    if provider == "soberano" {
        let motor_clone = Arc::clone(&state.motor);
        let tokens_limit = max_tokens.unwrap_or(2048) as usize;
        
        let mut full_prompt = sys_prompt.clone();
        full_prompt.push_str("\n\n");
        for msg in &messages {
            full_prompt.push_str(&format!("{}: {}\n", msg.role, msg.content));
        }

        tauri::async_runtime::spawn_blocking(move || {
            let mut motor = motor_clone.lock().map_err(|_| "Deadlock al bloquear Motor Soberano")?;
            // Aplicar temperatura cuántica al motor antes de inferir
            motor.set_temperature(temperature);
            let res = motor.inferir(&full_prompt, tokens_limit, |partial| {
                window.emit("soberano-stream", partial).ok();
                !cancel_flag.load(std::sync::atomic::Ordering::Relaxed)
            }).map_err(|e| format!("Error en Motor Soberano: {}", e))?;

            Ok(res.0)
        }).await.map_err(|e| format!("Error en el hilo asíncrono: {}", e))?
    } else {
        tauri::async_runtime::spawn_blocking(move || {
            let motor_cloud = moset_core::cloud_ai::MotorCloud::nuevo(&provider, &model, &api_key, base_url.as_deref());
            let res = motor_cloud.inferir(&sys_prompt, &messages, |partial| {
                window.emit("soberano-stream", partial).ok();
                !cancel_flag.load(std::sync::atomic::Ordering::Relaxed)
            }).map_err(|e| format!("Error en Motor Cloud: {}", e))?;
            
            Ok(res)
        }).await.map_err(|e| format!("Error en el hilo asíncrono: {}", e))?
    }
}

#[tauri::command]
async fn autocomplete_soberano(
    state: tauri::State<'_, AiState>,
    prefix: String,
    suffix: String,
) -> Result<String, String> {
    let motor_clone = Arc::clone(&state.motor);
    // Formato FIM genérico (funciona con Qwen Coder o Llama FIM)
    let prompt = format!("<|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>");
    
    tauri::async_runtime::spawn_blocking(move || {
        let mut motor = motor_clone.lock().map_err(|_| "Deadlock al bloquear MotorNaraka")?;
        let mut completion_result = String::new();
        
        let res = motor.inferir(&prompt, 32, |partial| {
            completion_result.push_str(&partial);
            true // Continuar, no cancelable por ahora para ser rápido
        });

        match res {
            Ok((_, _, _)) => Ok(completion_result),
            Err(e) => Err(format!("Error inferiendo autocompletado: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Error asíncrono AI: {}", e))?
}

mod tauri_bridge;
use std::sync::{Arc, Mutex};
use tauri_bridge::PtyState;
use tauri::{Manager, Emitter};

// ─── Extension Manager ────────────────────────────────────────────────────────
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Extension {
    id: String,
    name: String,
    description: String,
    version: String,
    enabled: bool,
}

struct ExtensionState {
    extensions: Arc<Mutex<Vec<Extension>>>,
    config_path: std::path::PathBuf,
}

impl ExtensionState {
    fn save(&self) {
        if let Ok(guard) = self.extensions.lock() {
            if let Ok(json) = serde_json::to_string_pretty(&*guard) {
                let _ = std::fs::write(&self.config_path, json);
            }
        }
    }
}

#[tauri::command]
fn fetch_extensions(state: tauri::State<'_, ExtensionState>) -> Vec<Extension> {
    state.extensions.lock().unwrap().clone()
}

#[tauri::command]
fn toggle_extension(state: tauri::State<'_, ExtensionState>, id: String, enabled: bool) -> Result<(), String> {
    let mut exts = state.extensions.lock().unwrap();
    if let Some(ext) = exts.iter_mut().find(|e| e.id == id) {
        ext.enabled = enabled;
        drop(exts); // Liberar lock antes de save()
    } else {
        return Err("Extensión no encontrada".to_string());
    }

    state.save();
    Ok(())
}

// ─── CUDA Cache Cleanup ──────────────────────────────────────────────────────

#[tauri::command]
fn clean_cuda_cache() -> Result<String, String> {
    let mut cleaned = Vec::new();
    
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        let base = std::path::PathBuf::from(local_app_data);
        
        let cache_dirs = [
            base.join("NVIDIA").join("DXCache"),
            base.join("NVIDIA").join("GLCache"),
        ];
        
        for dir in &cache_dirs {
            if dir.exists() {
                match std::fs::remove_dir_all(dir) {
                    Ok(_) => {
                        std::fs::create_dir_all(dir).ok();
                        cleaned.push(format!("✓ {}", dir.display()));
                    },
                    Err(e) => cleaned.push(format!("✗ {} ({})", dir.display(), e)),
                }
            }
        }
    }
    
    if let Some(app_data) = std::env::var_os("APPDATA") {
        let compute_cache = std::path::PathBuf::from(app_data)
            .parent().unwrap_or(std::path::Path::new(""))
            .join("Local")
            .join("NVIDIA")
            .join("ComputeCache");
        
        if compute_cache.exists() {
            match std::fs::remove_dir_all(&compute_cache) {
                Ok(_) => {
                    std::fs::create_dir_all(&compute_cache).ok();
                    cleaned.push(format!("✓ {}", compute_cache.display()));
                },
                Err(e) => cleaned.push(format!("✗ {} ({})", compute_cache.display(), e)),
            }
        }
    }
    
    if cleaned.is_empty() {
        Ok("No se encontraron caches de NVIDIA para limpiar.".to_string())
    } else {
        Ok(format!("Caches limpiados:\n{}", cleaned.join("\n")))
    }
}

// ─── Git Integration ────────────────────────────────────────────────────────
#[tauri::command]
async fn git_status(workspace_path: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(workspace_path)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        // En un repositorio vacío o sin git, puede fallar silenciosamente, retornamos string vacío.
        Ok(String::new())
    }
}

#[tauri::command]
async fn git_auto_sync(workspace_path: String) -> Result<String, String> {
    let add_output = std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(&workspace_path)
        .output()
        .map_err(|e| e.to_string())?;
    
    if !add_output.status.success() {
        return Err(String::from_utf8_lossy(&add_output.stderr).to_string());
    }

    let _commit_output = std::process::Command::new("git")
        .args(["commit", "-m", "Auto-Sync by Moset Studio"])
        .current_dir(&workspace_path)
        .output()
        .map_err(|e| e.to_string())?;

    let push_output = std::process::Command::new("git")
        .args(["push"])
        .current_dir(&workspace_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !push_output.status.success() {
        return Err(String::from_utf8_lossy(&push_output.stderr).to_string());
    }

    Ok("Sincronización completada exitosamente".to_string())
}

// ─── Entry point ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ----- SEÑAL DE ARRANQUE PARA SPLASH SCREEN -----
            println!("MOSET_APP_READY");

            app.manage(PtyState {
                writer: Arc::new(Mutex::new(None)),
                child: Arc::new(Mutex::new(None)),
                master: Arc::new(Mutex::new(None)),
            });
            app.manage(AiState {
                motor: Arc::new(Mutex::new(moset_core::ai::MotorNaraka::nuevo())),
                cancel_flag: Arc::new(std::sync::atomic::AtomicBool::new(false)),
                clean_cuda_on_exit: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            });

            let config_path = app.path().app_data_dir().expect("Failed to get app_data_dir").join("extensions.json");
            
            let default_exts = vec![
                Extension {
                    id: "moset.language.support".into(),
                    name: "Moset Language Support".into(),
                    description: "Soporte oficial para la sintaxis y AST del lenguaje Moset.".into(),
                    version: "0.2.0".into(),
                    enabled: true,
                },
                Extension {
                    id: "moset.ai.assistant".into(),
                    name: "Moset AI Assistant".into(),
                    description: "Motor Soberano con Llama.cpp y soporte GGUF nativo en la IDE.".into(),
                    version: "1.0.0".into(),
                    enabled: true,
                }
            ];

            let exts = if config_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&config_path) {
                    serde_json::from_str(&content).unwrap_or(default_exts.clone())
                } else { default_exts.clone() }
            } else {
                std::fs::create_dir_all(config_path.parent().unwrap()).ok();
                default_exts.clone()
            };

            app.manage(ExtensionState {
                extensions: Arc::new(Mutex::new(exts)),
                config_path,
            });
            tauri_bridge::spawn_pty(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Limpiar PTY
                let pty_state: tauri::State<'_, PtyState> = window.state();
                if let Ok(mut child_guard) = pty_state.child.lock() {
                    if let Some(child) = child_guard.as_mut() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                };
                // Limpiar Motor IA — liberar modelo de RAM/VRAM
                let ai_state: tauri::State<'_, AiState> = window.state();
                if let Ok(mut motor) = ai_state.motor.lock() {
                    motor.descargar();
                }
                
                // Limpiar Cachés de Cuda si está configurado
                if ai_state.clean_cuda_on_exit.load(std::sync::atomic::Ordering::Relaxed) {
                    let _ = clean_cuda_cache();
                }
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            version,
            ejecutar,
            validate_code,
            cargar_modelo,
            chat_soberano,
            chat_orquestado,
            autocomplete_soberano,
            cancel_inference,
            descargar_modelo,
            set_clean_cuda_on_exit,
            tauri_bridge::write_pty,
            tauri_bridge::resize_pty,
            tauri_bridge::kill_pty,
            read_directory,
            read_file_content,
            save_file_content,
            create_file,
            create_folder,
            delete_item,
            rename_item,
            fetch_full_context,
            fetch_extensions,
            toggle_extension,
            execute_agent_tool,
            clean_cuda_cache,
            search_workspace,
            git_status,
            git_auto_sync,
        ])
        .run(tauri::generate_context!())
        .expect("Error iniciando Moset IDE");
}
