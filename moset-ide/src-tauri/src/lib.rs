// ─── Moset IDE - Tauri Backend ────────────────────────────────────────────────
// Motor Soberano v0.2 | Moset Studio
// ─────────────────────────────────────────────────────────────────────────────

mod et_dict;

#[tauri::command]
fn version() -> String {
    "Moset IDE v0.2 | Motor Soberano | Moset Studio".to_string()
}

#[tauri::command]
async fn ejecutar(_app: tauri::AppHandle, vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, codigo: String, idioma: Option<String>) -> Result<String, String> {
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

    let vigilante = make_vigilante(&vig_cfg);
    let mut compilador = Compilador::nuevo();
    compilador.vigilante = Some(std::rc::Rc::new(vigilante));
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
            let raw = {
                let guard = output.lock().unwrap();
                if guard.is_empty() {
                    format!("{:?}", res)
                } else {
                    guard.clone()
                }
            };

            // Convertir cada línea a un objeto tipado para el frontend
            let lines: Vec<serde_json::Value> = raw
                .lines()
                .map(|line| {
                    let kind = classify_output_line(line);
                    serde_json::json!({
                        "type": kind,
                        "content": line
                    })
                })
                .collect();

            let payload = serde_json::json!({ "lines": lines });
            Ok(payload.to_string())
        },
        Err(e) => Err(format!("Error de ejecución: {}", e)),
    }
}

/// Clasifica una línea de salida para que el frontend sepa cómo renderizarla.
fn classify_output_line(line: &str) -> &'static str {
    if line.contains("Bit:") && (line.contains('\u{2588}') || line.contains('\u{2591}')) {
        "quantum"
    } else if line.contains(" { ") && line.contains(':') {
        "molde"
    } else if line.starts_with("===") && line.ends_with("===") {
        "header"
    } else if line.starts_with("Error:") || line.starts_with("error:") {
        "error"
    } else if line.trim().is_empty() {
        "separator"
    } else {
        "text"
    }
}

#[tauri::command]
fn validate_code(codigo: String, idioma: Option<String>) -> Vec<moset_core::linter::Diagnostic> {
    use moset_core::{lexer::Lexer, parser::Parser, linter::Linter};

    let mut lex = Lexer::nuevo(&codigo, idioma.as_deref());
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
fn search_workspace(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;

    let mut results = Vec::new();
    let q = query.to_lowercase();

    fn search_dir(dir: std::path::PathBuf, q: &str, results: &mut Vec<SearchResult>, vigilante: &moset_core::vigilante::Vigilante) {
        if results.len() >= 500 { return; }
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if results.len() >= 500 { return; }
                let p = entry.path();
                let path_str = p.to_string_lossy().replace("\\", "/");
                if vigilante.autorizar_ruta(&path_str).is_err() { continue; }
                if p.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name != "node_modules" && name != "target" && name != ".git" && name != "dist" {
                        search_dir(p, q, results, vigilante);
                    }
                } else {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        for (i, line) in content.lines().enumerate() {
                            if results.len() >= 500 { return; }
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
    
    search_dir(std::path::PathBuf::from(path), &q, &mut results, &vigilante);
    Ok(results)
}


#[tauri::command]
fn read_directory(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, path: String, max_depth: Option<u32>) -> Result<Vec<FsTreeNode>, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err(format!("No es un directorio: {}", path));
    }
    let depth = max_depth.unwrap_or(3);
    Ok(walk_dir(root, root, depth, &vigilante))
}

fn walk_dir(base: &std::path::Path, dir: &std::path::Path, depth: u32, vigilante: &moset_core::vigilante::Vigilante) -> Vec<FsTreeNode> {
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
        let path_str = full_path.to_string_lossy().replace('\\', "/");
        if vigilante.autorizar_ruta(&path_str).is_err() { continue; }

        if entry.file_type().map(|f| f.is_dir()).unwrap_or(false) {
            let children = walk_dir(base, &full_path, depth - 1, vigilante);
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
fn read_file_content(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, path: String) -> Result<String, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Error leyendo {}: {}", path, e))
}

#[tauri::command]
fn save_chat_sessions(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("No se pudo obtener app_data_dir: {}", e))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Error creando directorio de datos: {}", e))?;
    let file_path = data_dir.join("chat_sessions.json");
    std::fs::write(&file_path, data)
        .map_err(|e| format!("Error guardando sesiones de chat: {}", e))
}

#[tauri::command]
fn load_chat_sessions(app_handle: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("No se pudo obtener app_data_dir: {}", e))?;
    let file_path = data_dir.join("chat_sessions.json");
    if !file_path.exists() {
        return Ok("[]".to_string());
    }
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Error leyendo sesiones de chat: {}", e))
}

// ─── Comandos UAST / .et-dict ───────────────────────────────────────────────

#[tauri::command]
fn proyectar_archivo(vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, ruta: String, idioma: String) -> Result<String, String> {
    use et_dict::EtDict;
    use std::path::Path;

    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&ruta).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;

    let path = Path::new(&ruta);
    let dir = path.parent().ok_or("Ruta inválida: sin directorio padre")?;
    let fuente = std::fs::read_to_string(path)
        .map_err(|e| format!("Error leyendo {}: {}", ruta, e))?;

    let dict = EtDict::cargar(dir)?;
    Ok(dict.proyectar_texto(&fuente, &idioma))
}

#[tauri::command]
fn proyectar_codigo(vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, dir_proyecto: String, texto_canonico: String, idioma: String) -> Result<String, String> {
    use et_dict::EtDict;
    use std::path::Path;

    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&dir_proyecto).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;

    let dir = Path::new(&dir_proyecto);
    let dict = EtDict::cargar(dir)?;
    Ok(dict.proyectar_texto(&texto_canonico, &idioma))
}

#[tauri::command]
fn dematerializar_codigo(vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, dir_proyecto: String, texto_local: String, idioma: String) -> Result<String, String> {
    use et_dict::EtDict;
    use std::path::Path;

    let vigilante = make_vigilante(&vig_cfg);
    if let Err(e) = vigilante.autorizar_ruta(&dir_proyecto) {
        eprintln!("dematerializar_codigo: Vigilante denegó acceso a {}: {}", dir_proyecto, e);
        return Err(format!("Vigilante: Acceso denegado: {}", e));
    }

    let dir = Path::new(&dir_proyecto);
    let mut dict = match EtDict::cargar(dir) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("dematerializar_codigo: Error al cargar dict en {}: {}", dir.display(), e);
            return Err(e);
        }
    };
    
    let (texto_canonico, nuevos) = dict.dematerializar_texto(&texto_local, &idioma);
    eprintln!("dematerializar_codigo: {} palabras canonizadas. Se encontraron {} identificadores nuevos.", texto_canonico.len(), nuevos.len());
    
    Ok(texto_canonico)
}

#[tauri::command]
fn dematerializar_y_guardar(vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, ruta: String, texto_local: String, idioma: String) -> Result<Vec<String>, String> {
    use et_dict::EtDict;
    use std::path::Path;

    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&ruta).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;

    let path = Path::new(&ruta);
    let dir = path.parent().ok_or("Ruta inválida: sin directorio padre")?;

    let mut dict = EtDict::cargar(dir)?;
    let (texto_canonico, nuevos) = dict.dematerializar_texto(&texto_local, &idioma);

    // Guardar el texto canónico en disco
    std::fs::write(path, &texto_canonico)
        .map_err(|e| format!("Error guardando {}: {}", ruta, e))?;

    // Si hubo nuevos identificadores, actualizar el .et-dict
    if !nuevos.is_empty() {
        dict.guardar(dir)?;
    }

    Ok(nuevos)
}

#[tauri::command]
fn get_et_dict(vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, dir_proyecto: String) -> Result<serde_json::Value, String> {
    use et_dict::EtDict;
    use std::path::Path;

    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&dir_proyecto).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;

    let dir = Path::new(&dir_proyecto);
    let dict = EtDict::cargar(dir)?;
    let mut value = serde_json::to_value(&dict)
        .map_err(|e| format!("Error serializando dict: {}", e))?;
    
    if let serde_json::Value::Object(ref mut map) = value {
        map.insert("_exists".to_string(), serde_json::Value::Bool(dir.join(".et-dict").exists()));
    }
    Ok(value)
}

#[tauri::command]
fn crear_et_dict_por_defecto(vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, dir_proyecto: String) -> Result<(), String> {
    use et_dict::EtDict;
    use std::path::Path;

    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&dir_proyecto).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;

    let dir = Path::new(&dir_proyecto);
    let mut dict = EtDict::cargar(dir)?;
    // Agregamos un par de keywords de ejemplo u opciones por defecto
    dict.identifiers.insert(
        "ejemplo_variable".to_string(),
        et_dict::IdentEntry {
            tipo: et_dict::IdentTipo::Variable,
            traducciones: std::collections::HashMap::from([
                ("en".to_string(), "example_variable".to_string()),
                ("es".to_string(), "ejemplo_variable".to_string())
            ]),
        }
    );
    dict.guardar(dir)
}

#[tauri::command]
fn actualizar_traduccion_dict(
    vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>,
    dir_proyecto: String,
    canonico: String,
    idioma: String,
    nuevo_nombre: String,
) -> Result<(), String> {
    use et_dict::EtDict;
    use std::path::Path;

    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&dir_proyecto).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;

    let dir = Path::new(&dir_proyecto);
    let mut dict = EtDict::cargar(dir)?;
    dict.actualizar_traduccion(&canonico, &idioma, &nuevo_nombre)?;
    dict.guardar(dir)
}

#[tauri::command]
fn purgar_et_dict(vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, dir_proyecto: String) -> Result<usize, String> {
    use et_dict::EtDict;
    use std::path::Path;
    use std::collections::HashSet;
    use moset_core::lexer::Lexer;
    use moset_core::lexer::Token;

    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&dir_proyecto).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;

    let root = Path::new(&dir_proyecto);
    let mut dict = EtDict::cargar(root)?;

    let mut canonicos_activos = HashSet::new();

    fn scan_dir(dir: &Path, activos: &mut HashSet<String>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name != "node_modules" && name != "target" && !name.starts_with('.') {
                        scan_dir(&p, activos);
                    }
                } else if p.extension().map_or(false, |ext| ext == "et" || ext == "moset") {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        let mut lex = Lexer::nuevo(&content, None);
                        if let Ok(tokens) = lex.tokenizar() {
                            for t in tokens {
                                if let Token::Ident(nombre) = t.token {
                                    activos.insert(nombre);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    scan_dir(root, &mut canonicos_activos);

    let count_before = dict.identifiers.len();
    dict.identifiers.retain(|k, _| canonicos_activos.contains(k));
    let eliminados = count_before - dict.identifiers.len();

    if eliminados > 0 {
        dict.guardar(root)?;
    }

    Ok(eliminados)
}

#[tauri::command]
fn create_file(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, path: String) -> Result<(), String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;
    std::fs::File::create(&path)
        .map(|_| ())
        .map_err(|e| format!("Error creando archivo {}: {}", path, e))
}

#[tauri::command]
fn create_folder(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, path: String) -> Result<(), String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado: {}", e))?;
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Error creando carpeta {}: {}", path, e))
}

#[tauri::command]
fn delete_item(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, path: String) -> Result<(), String> {
    let vigilante = make_vigilante(&vig_cfg);
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
fn rename_item(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, old_path: String, new_path: String) -> Result<(), String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&old_path).map_err(|e| format!("Vigilante: Acceso denegado (origen): {}", e))?;
    vigilante.autorizar_ruta(&new_path).map_err(|e| format!("Vigilante: Acceso denegado (destino): {}", e))?;
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Error renombrando de {} a {}: {}", old_path, new_path, e))
}

#[tauri::command]
fn save_file_content(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, path: String, content: String) -> Result<(), String> {
    let vigilante = make_vigilante(&vig_cfg);
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

fn extract_moset_skeleton(content: &str) -> String {
    let mut skeleton = String::new();
    let mut current_block_indent: Option<usize> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        let indent = line.chars().take_while(|c| *c == ' ').count();

        // Skip empty lines if we are inside a block we are condensing
        if trimmed.is_empty() && current_block_indent.is_some() {
            continue;
        }

        // Check if we exited the current condensed block
        if let Some(block_indent) = current_block_indent {
            if indent <= block_indent {
                // Block ended
                skeleton.push_str(&format!("{}// ... impl condensado para ahorrar tokens ...\n", " ".repeat(block_indent + 4)));
                current_block_indent = None;
            } else {
                // Still inside the condensed block, skip the line
                continue;
            }
        }

        if trimmed.starts_with("importar ") || trimmed.starts_with("usar ") {
            skeleton.push_str(line);
            skeleton.push('\n');
        } else if trimmed.starts_with("esfera ") || trimmed.starts_with("molde ") || trimmed.starts_with("fn ") || trimmed.starts_with("pub fn ") {
            skeleton.push_str(line);
            skeleton.push('\n');
            
            // Check if it's a rust-style block with { 
            if trimmed.ends_with("{") {
                skeleton.push_str(&format!("{}// ... impl condensado para ahorrar tokens ...\n", " ".repeat(indent + 4)));
                skeleton.push_str(&format!("{}}}\n", " ".repeat(indent)));
            } else if !trimmed.ends_with(";") {
                // It's an indentation-based block (.et style)
                current_block_indent = Some(indent);
            }
        } else {
            // Keep the line if we are not skipping
            skeleton.push_str(line);
            skeleton.push('\n');
        }
    }

    if let Some(block_indent) = current_block_indent {
        skeleton.push_str(&format!("{}// ... impl condensado para ahorrar tokens ...\n", " ".repeat(block_indent + 4)));
    }

    if skeleton.trim().is_empty() {
        content.to_string()
    } else {
        format!("/* [MOSET U-AST SKELETON - OPTIMIZADO PARA IA] */\n{}", skeleton)
    }
}

fn extract_words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() > 2)
        .map(|s| s.to_lowercase())
        .collect()
}

#[tauri::command]
fn fetch_full_context(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, paths: Vec<String>, query: Option<String>, max_context_tokens: Option<usize>) -> Result<String, String> {
    let max_chars = max_context_tokens.unwrap_or(2500) * 4;

    let valid_extensions = ["ce", "et", "rs", "ts", "tsx", "js", "jsx", "md", "json", "toml", "css", "py", "html", "sh"];
    let ignore_dirs = ["node_modules", ".git", "target", "dist", "build"];

    let mut all_chunks: Vec<ContextChunk> = Vec::new();

    let query_words = query.as_ref().map(|q| extract_words(q)).unwrap_or_default();
    
    let explicit_paths: std::collections::HashSet<String> = paths.iter().map(|p| p.replace('\\', "/")).collect();

    fn process_path(
        path: &std::path::Path,
        base_path: &std::path::Path,
        chunks: &mut Vec<ContextChunk>,
        query_words: &[String],
        valid_extensions: &[&str],
        ignore_dirs: &[&str],
        vigilante: &moset_core::vigilante::Vigilante,
        explicit_paths: &std::collections::HashSet<String>,
    ) {
        let path_str = path.to_string_lossy().replace('\\', "/");
        if ignore_dirs.iter().any(|d| path_str.contains(&format!("/{}", d)) || path_str.ends_with(d)) {
            return;
        }

        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                    // 🛡️ Vigilante: verificar sandbox antes de leer el archivo
                    if vigilante.autorizar_ruta(&path_str).is_err() {
                        return;
                    }
                    if let Ok(mut content) = std::fs::read_to_string(path) {
                        let rel_path = path.strip_prefix(base_path).unwrap_or(path).to_string_lossy().to_string();

                        let ext_str = ext.to_lowercase();
                        if ext_str == "et" {
                            content = extract_moset_skeleton(&content);
                        }

                        let mut score = if query_words.is_empty() {
                            1.0
                        } else {
                            let content_words = extract_words(&content);
                            let mut match_count = 0;
                            for qw in query_words {
                                if content_words.contains(qw) {
                                    match_count += 1;
                                }
                            }
                            match_count as f32
                        };
                        
                        if explicit_paths.contains(&path_str) {
                            score += 1000.0;
                        }

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
                    process_path(&entry.path(), base_path, chunks, query_words, valid_extensions, ignore_dirs, vigilante, explicit_paths);
                }
            }
        }
    }

    let vigilante = make_vigilante(&vig_cfg);
    for p in paths {
        let path = std::path::Path::new(&p);
        let base_path = if path.is_file() { path.parent().unwrap_or(path) } else { path };
        process_path(path, base_path, &mut all_chunks, &query_words, &valid_extensions, &ignore_dirs, &vigilante, &explicit_paths);
    }
    
    // Sort chunks by score (descending)
    all_chunks.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    let mut total_chars = 0;
    let mut output = String::new();
    
    for chunk in all_chunks {
        if total_chars >= max_chars { break; }
        
        output.push_str(&format!("\n--- Archivo: {} (Relevancia: {}) ---\n", chunk.file_path, chunk.score));
        
        let remaining = max_chars.saturating_sub(total_chars);
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
    
    if total_chars >= max_chars {
        output.push_str("\n... [Contexto RAG truncado por límite de seguridad global]");
    }
    
    Ok(output)
}

// ─── Agente Autónomo ─────────────────────────────────────────────────────────

#[tauri::command]
async fn execute_agent_tool(app_handle: tauri::AppHandle, vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, mcp_state: tauri::State<'_, McpState>, lsp_state: tauri::State<'_, LspState>, call: moset_core::agent::ToolCall) -> Result<String, String> {
    use moset_core::agent::AgentTool;
    let vigilante = make_vigilante(&vig_cfg);

    match call.tool {
        AgentTool::ReadDirectory => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("./").to_string();
            
            // 🛡️ Vigilante: verificar que la ruta está dentro del sandbox
            vigilante.autorizar_ruta(&path)
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;
                
            let res = read_directory(vig_cfg.clone(), path, Some(3))?;
            Ok(serde_json::to_string(&res).unwrap_or_else(|_| "[]".to_string()))
        },
        AgentTool::ReadFile => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            
            // 🛡️ Vigilante: verificar que la ruta está dentro del sandbox
            vigilante.autorizar_ruta(&path)
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;
                
            read_file_content(vig_cfg.clone(), path)
        },
        AgentTool::WriteToFile | AgentTool::WriteFile => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let content = call.args.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();

            // 🛡️ Vigilante: verificar que la ruta está dentro del sandbox
            vigilante.autorizar_ruta(&path)
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            save_file_content(vig_cfg.clone(), path.clone(), content)?;
            Ok(format!("Archivo {} guardado correctamente.", path))
        },
        AgentTool::ReplaceFileContent => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let target = call.args.get("targetContent").and_then(|v| v.as_str()).unwrap_or("");
            let replacement = call.args.get("replacementContent").and_then(|v| v.as_str()).unwrap_or("");

            // 🛡️ Vigilante: verificar sandbox antes de leer/escribir
            vigilante.autorizar_ruta(&path)
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            let current_content = read_file_content(vig_cfg.clone(), path.clone())?;
            
            let new_content = if current_content.contains(target) {
                current_content.replacen(target, replacement, 1)
            } else {
                let target_trimmed = target.trim();
                if current_content.contains(target_trimmed) {
                    current_content.replacen(target_trimmed, replacement, 1)
                } else {
                    // Normalize whitespace for a more flexible matching
                    let target_norm = target.replace("\r\n", "\n");
                    let current_norm = current_content.replace("\r\n", "\n");
                    if current_norm.contains(&target_norm) {
                        current_norm.replacen(&target_norm, replacement, 1)
                    } else {
                        return Err(format!("No se encontró el texto objetivo en {}. Revisa que el código coincida exactamente (incluyendo los espacios).", path));
                    }
                }
            };
            
            save_file_content(vig_cfg.clone(), path.clone(), new_content)?;
            Ok(format!("Archivo {} modificado correctamente utilizando bloques de reemplazo.", path))
        },
        AgentTool::SearchWorkspace => {
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("./").to_string();
            let query = call.args.get("query").and_then(|v| v.as_str()).unwrap_or("").to_string();

            // 🛡️ Vigilante: verificar que la ruta raíz de búsqueda está dentro del sandbox
            vigilante.autorizar_ruta(&path)
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            let res = search_workspace(vig_cfg.clone(), path, query)?;
            Ok(serde_json::to_string(&res).unwrap_or_else(|_| "[]".to_string()))
        },
        AgentTool::RunCommand => {
            let cmd = call.args.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();

            // 🛡️ Vigilante: auditar el comando antes de ejecutarlo con nivel cauteloso (0.80).
            vigilante.autorizar(&cmd, Some(0.80))
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            #[cfg(target_os = "windows")]
            let output = tokio::process::Command::new("powershell")
                .arg("-Command").arg(&cmd).output().await;

            #[cfg(not(target_os = "windows"))]
            let output = tokio::process::Command::new("sh")
                .arg("-c").arg(&cmd).output().await;

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
        AgentTool::GitCommit => {
            let message = call.args.get("message").and_then(|v| v.as_str()).unwrap_or("Auto-commit por Agente Autónomo").to_string();
            let path = call.args.get("path").and_then(|v| v.as_str()).unwrap_or("./").to_string();
            
            vigilante.autorizar("git commit", Some(0.80))
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            tokio::process::Command::new("git").args(["add", "."]).current_dir(&path).output().await.ok();
            
            let output = tokio::process::Command::new("git")
                .args(["commit", "-m", &message])
                .current_dir(&path)
                .output().await;
                
            match output {
                Ok(out) => {
                    let res = format!("{}\n{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
                    Ok(res.trim().to_string())
                },
                Err(e) => Err(format!("Error ejecutando git commit: {}", e))
            }
        },
        AgentTool::ListProcesses => {
            vigilante.autorizar("tasklist", Some(0.80))
                .map_err(|e| format!("Agente bloqueado por el Vigilante:\n{}", e))?;

            #[cfg(target_os = "windows")]
            let output = tokio::process::Command::new("tasklist").output().await;
            
            #[cfg(not(target_os = "windows"))]
            let output = tokio::process::Command::new("ps").arg("aux").output().await;
            
            match output {
                Ok(out) => {
                    let mut res = String::from_utf8_lossy(&out.stdout).to_string();
                    if res.len() > 2000 {
                        res.truncate(2000);
                        res.push_str("\n...[truncado]");
                    }
                    Ok(res)
                },
                Err(e) => Err(format!("Error listando procesos: {}", e))
            }
        },
        AgentTool::InjectGgufUi => {
            let key = call.args.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let value_type = call.args.get("type").and_then(|v| v.as_str()).unwrap_or("string").to_string();
            let value = call.args.get("value").cloned().unwrap_or(serde_json::Value::Null);

            if key.is_empty() {
                return Err("La clave (key) no puede estar vacía.".to_string());
            }

            #[derive(serde::Serialize, Clone)]
            struct GgufInjectPayload {
                key: String,
                value_type: String,
                value: serde_json::Value,
            }
            
            use tauri::Emitter;
            let payload = GgufInjectPayload { key: key.clone(), value_type, value };
            app_handle.emit("gguf-ui-inject", payload).map_err(|e| format!("Error emitiendo evento: {}", e))?;
            
            Ok(format!("Inyectado metadato '{}' en la interfaz GGUF del usuario de manera invisible. Recomienda al usuario presionar 'Aplicar al archivo' para que se guarde físicamente.", key))
        },
        AgentTool::McpListTools => {
            let server = call.args.get("server").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let clients = mcp_state.clients.lock().unwrap();
            if let Some(client) = clients.get(&server) {
                let tools = client.list_tools()?;
                Ok(serde_json::to_string(&tools).unwrap_or_else(|_| "[]".to_string()))
            } else {
                Err(format!("Servidor MCP '{}' no iniciado.", server))
            }
        },
        AgentTool::McpCallTool => {
            let server = call.args.get("server").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let tool = call.args.get("tool_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let args = call.args.get("arguments").cloned().unwrap_or(serde_json::json!({}));
            
            // 🛡️ Vigilante: Auditar el nombre de la tool MCP contra la lista de operaciones peligrosas.
            vigilante.autorizar(&format!("mcp:{}:{}", server, tool), Some(0.80))
                .map_err(|e| format!("Agente bloqueado por el Vigilante (MCP tool '{}'):\n{}", tool, e))?;

            let clients = mcp_state.clients.lock().unwrap();
            if let Some(client) = clients.get(&server) {
                let res = client.call_tool(&tool, args)?;
                Ok(serde_json::to_string(&res).unwrap_or_else(|_| "{}".to_string()))
            } else {
                Err(format!("Servidor MCP '{}' no iniciado.", server))
            }
        },
        AgentTool::LspDiagnostics => {
            let server = call.args.get("server").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let file_uri = call.args.get("uri").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let clients = lsp_state.clients.lock().unwrap();
            if let Some(client) = clients.get(&server) {
                let diags = client.get_diagnostics(&file_uri);
                Ok(serde_json::to_string(&diags).unwrap_or_else(|_| "[]".to_string()))
            } else {
                Err(format!("LSP '{}' no iniciado.", server))
            }
        },
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
    eprintln!("[ORQUESTADOR] Iniciando carga de modelo: {}", modelo_path);
    eprintln!("[ORQUESTADOR] Tokenizer: {}", tokenizer_path);
    let motor_clone = Arc::clone(&state.motor);
    tauri::async_runtime::spawn_blocking(move || {
        let mut motor = motor_clone.lock().map_err(|_| "Deadlock al bloquear MotorNaraka")?;
        motor.cargar_tokenizer(&tokenizer_path)?;
        let res = motor.cargar_gguf(&modelo_path)?;
        eprintln!("[ORQUESTADOR] Modelo cargado exitosamente en memoria.");
        Ok(res)
    })
    .await
    .map_err(|e| format!("Error en el hilo asíncrono: {}", e))?
}

#[tauri::command]
fn cancel_inference(state: tauri::State<'_, AiState>) {
    eprintln!("[ORQUESTADOR] Señal de cancelación de inferencia recibida.");
    state.cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
async fn descargar_modelo(state: tauri::State<'_, AiState>) -> Result<String, String> {
    eprintln!("[ORQUESTADOR] Iniciando descarga del modelo de VRAM/RAM.");
    let motor_clone = Arc::clone(&state.motor);
    tauri::async_runtime::spawn_blocking(move || {
        let mut motor = motor_clone.lock().map_err(|_| "Deadlock al bloquear Motor Soberano")?;
        motor.descargar();
        eprintln!("[ORQUESTADOR] Modelo descargado. Memoria liberada.");
        Ok("Modelo descargado. RAM/VRAM liberada.".to_string())
    })
    .await
    .map_err(|e| format!("Error en el hilo asíncrono: {}", e))?
}

#[derive(serde::Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    LocalGguf,
    Nube,
    Custom,
}

impl AiProvider {
    pub fn as_cloud_str(&self) -> &'static str {
        match self {
            AiProvider::Nube    => "nube",
            AiProvider::Custom  => "custom",
            AiProvider::LocalGguf => "nube", // Safety fallback, should never reach cloud path
        }
    }
}

#[tauri::command]
async fn chat_orquestado(
    state: tauri::State<'_, AiState>,
    window: tauri::Window,
    messages: Vec<moset_core::cloud_ai::Mensaje>,
    provider: AiProvider,
    model: String,
    api_key: String,
    base_url: Option<String>,
    max_tokens: Option<u32>,
    q_collapse_method: Option<String>,
    q_alpha: Option<f32>,
    q_entanglement: Option<bool>,
) -> Result<String, String> {
    let cancel_flag = Arc::clone(&state.cancel_flag);
    cancel_flag.store(false, std::sync::atomic::Ordering::Relaxed);

    eprintln!("[ORQUESTADOR] Iniciando chat_orquestado | Proveedor: {:?} | Modelo: {}", provider, model);

    // ─── Mapeo Cuántico ───────────────────────────────────────────────────────
    // alpha (amplitud del estado |0⟩) → temperature del modelo
    // determinístico → temperature 0.0 (colapso determinista, 1 respuesta)
    // probabilístico → temperature = alpha (Born Rule: P=α², α≈0.7071 → T≈0.71)
    // ai_assisted → temperature = alpha + 0.1 (motor decide con más libertad)
    let collapse = q_collapse_method.as_deref().unwrap_or("probabilistic");
    let alpha = q_alpha.unwrap_or(0.7071_f32).clamp(0.0, 1.0);
    let _entanglement = q_entanglement.unwrap_or(false); // reservado para correlación futura entre bits

    let temperature: f32 = match collapse {
        "deterministic" => 0.0,
        "ai_assisted"   => (alpha + 0.1).min(1.0),
        _               => alpha, // probabilistic: T = α
    };

    // MEJ-7: The frontend already fully constructs the system prompt based on user settings,
    // context tokens, agent mode, and think directives. We just extract it from the messages array.
    let mut sys_prompt = String::new();
    let mut filtered_messages = Vec::new();
    
    for msg in messages {
        if msg.role == "system" {
            if !sys_prompt.is_empty() {
                sys_prompt.push_str("\n\n");
            }
            sys_prompt.push_str(&msg.content);
        } else {
            filtered_messages.push(msg);
        }
    }

    if provider == AiProvider::LocalGguf {
        let motor_clone = Arc::clone(&state.motor);
        let tokens_limit = max_tokens.unwrap_or(2048) as usize;
        
        let mut full_prompt = String::new();
        if !sys_prompt.is_empty() {
            full_prompt.push_str(&format!("<|im_start|>system\n{}<|im_end|>\n", sys_prompt));
        }
        for msg in &filtered_messages {
            full_prompt.push_str(&format!("<|im_start|>{}\n{}<|im_end|>\n", msg.role, msg.content));
        }
        full_prompt.push_str("<|im_start|>assistant\n");

        tauri::async_runtime::spawn_blocking(move || {
            let mut motor = motor_clone.lock().map_err(|_| "Deadlock al bloquear Motor Soberano")?;
            eprintln!("[ORQUESTADOR] Inferencia local GGUF iniciada (Temp: {:.2})", temperature);
            // Aplicar temperatura cuántica al motor antes de inferir
            motor.set_temperature(temperature);
            let res = motor.inferir(&full_prompt, tokens_limit, |partial| {
                window.emit("soberano-stream", partial).ok();
                !cancel_flag.load(std::sync::atomic::Ordering::Relaxed)
            }).map_err(|e| {
                eprintln!("[ORQUESTADOR] Error en inferencia local: {}", e);
                format!("Error en Motor Soberano: {}", e)
            })?;
            eprintln!("[ORQUESTADOR] Inferencia local GGUF completada.");

            Ok(res.0)
        }).await.map_err(|e| format!("Error en el hilo asíncrono: {}", e))?
    } else {
        let max_tokens_opt = max_tokens;
        tauri::async_runtime::spawn_blocking(move || {
            let provider_str = provider.as_cloud_str();
            eprintln!("[ORQUESTADOR] Inferencia cloud iniciada ({})", provider_str);
            let motor_cloud = moset_core::cloud_ai::MotorCloud::nuevo(provider_str, &model, &api_key, base_url.as_deref());
            let res = motor_cloud.inferir(&sys_prompt, &filtered_messages, max_tokens_opt, |partial| {
                window.emit("soberano-stream", partial).ok();
                !cancel_flag.load(std::sync::atomic::Ordering::Relaxed)
            }).map_err(|e| {
                eprintln!("[ORQUESTADOR] Error en inferencia cloud: {}", e);
                format!("Error en Motor Cloud: {}", e)
            })?;
            eprintln!("[ORQUESTADOR] Inferencia cloud completada.");
            
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
        // try_lock en lugar de lock para evitar bloquear el runtime si el motor está ocupado
        let mut motor = motor_clone.try_lock()
            .map_err(|_| "Motor ocupado generando respuesta anterior. Intenta en un momento.".to_string())?;
        let mut completion_result = String::new();

        let res = motor.inferir(&prompt, 32, |partial| {
            completion_result.push_str(&partial);
            true
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

pub mod security;
use security::*;

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
fn fetch_extensions(state: tauri::State<'_, ExtensionState>) -> Result<Vec<Extension>, String> {
    Ok(state.extensions.lock().map_err(|_| "Error interno: mutex de extensiones envenenado".to_string())?.clone())
}

#[tauri::command]
fn toggle_extension(state: tauri::State<'_, ExtensionState>, id: String, enabled: bool) -> Result<(), String> {
    let mut exts = state.extensions.lock().map_err(|_| "Error interno: mutex de extensiones envenenado".to_string())?;
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

// ─── Macros / Custom Commands ───────────────────────────────────────────────

#[derive(serde::Serialize)]
struct MacroItem {
    id: String,
    name: String,
    path: String,
}

#[tauri::command]
fn list_macros(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, project_root: String) -> Result<Vec<MacroItem>, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&project_root).map_err(|e| format!("Vigilante: Acceso denegado a project root: {}", e))?;

    let commands_dir = std::path::PathBuf::from(project_root).join(".moset").join("commands");
    let mut macros = Vec::new();
    
    if commands_dir.exists() && commands_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(commands_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
                    let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                    let id = format!("project:{}", name);
                    macros.push(MacroItem {
                        id,
                        name,
                        path: path.to_string_lossy().replace("\\", "/"),
                    });
                }
            }
        }
    }
    
    // Sort by name
    macros.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(macros)
}

#[tauri::command]
fn read_macro(vig_cfg: tauri::State<'_, Mutex<VigilanteConfig>>, path: String) -> Result<String, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: Acceso denegado a leer macro: {}", e))?;
    std::fs::read_to_string(&path).map_err(|e| format!("Error leyendo macro {}: {}", path, e))
}

// ─── Git Integration ────────────────────────────────────────────────────────
#[tauri::command]
async fn git_status(workspace_path: String, vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>) -> Result<String, String> {
    // Validar ruta por Vigilante antes de ejecutar git
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&workspace_path).map_err(|e| format!("Vigilante: {}", e))?;

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
async fn git_auto_sync(workspace_path: String, github_api_key: Option<String>, vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>) -> Result<String, String> {
    // Validar ruta por Vigilante antes de ejecutar git
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&workspace_path).map_err(|e| format!("Vigilante: {}", e))?;
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

    let mut push_cmd = std::process::Command::new("git");
    push_cmd.current_dir(&workspace_path);

    if let Some(token) = github_api_key {
        if !token.is_empty() {
             push_cmd.args([
                 "-c", "credential.helper=", 
                 "-c", "credential.helper=!f() { echo password=$MOSET_GIT_TOKEN; }; f"
             ]);
             push_cmd.env("MOSET_GIT_TOKEN", token);
        }
    }
    push_cmd.arg("push");

    let push_output = push_cmd.output().map_err(|e| e.to_string())?;

    if !push_output.status.success() {
        return Err(String::from_utf8_lossy(&push_output.stderr).to_string());
    }

    Ok("Sincronización completada exitosamente".to_string())
}

// ─── MCP Client Integration ───────────────────────────────────────────────────

pub struct McpState {
    pub clients: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, moset_core::mcp::McpClient>>>,
}

#[derive(serde::Deserialize)]
struct McpServerConfig {
    command: String,
    args: Vec<String>,
}

#[derive(serde::Deserialize)]
struct McpConfig {
    #[serde(rename = "mcpServers")]
    mcp_servers: std::collections::HashMap<String, McpServerConfig>,
}

#[tauri::command]
async fn start_mcp_servers(state: tauri::State<'_, McpState>, vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>, project_root: String) -> Result<Vec<String>, String> {
    // Validar por Vigilante
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&project_root).map_err(|e| format!("Vigilante: Acceso denegado a project root para MCP: {}", e))?;

    let config_path = std::path::PathBuf::from(project_root).join(".moset").join("mcp.json");
    if !config_path.exists() {
        return Ok(vec![]);
    }

    let config_str = std::fs::read_to_string(config_path).map_err(|e| format!("Error leyendo mcp.json: {}", e))?;
    let config: McpConfig = serde_json::from_str(&config_str).map_err(|e| format!("Error parseando mcp.json: {}", e))?;

    let mut started = Vec::new();
    let mut clients = state.clients.lock().map_err(|_| "Error interno: mutex MCP envenenado".to_string())?;

    for (name, server_cfg) in config.mcp_servers {
        if clients.contains_key(&name) {
            continue; // Already started
        }
        
        match moset_core::mcp::McpClient::new(&server_cfg.command, &server_cfg.args) {
            Ok(client) => {
                if let Err(e) = client.initialize() {
                    return Err(format!("Error inicializando MCP '{}': {}", name, e));
                }
                clients.insert(name.clone(), client);
                started.push(name);
            },
            Err(e) => {
                return Err(format!("Error iniciando MCP '{}': {}", name, e));
            }
        }
    }

    Ok(started)
}

#[tauri::command]
async fn mcp_list_tools(state: tauri::State<'_, McpState>, server_name: String) -> Result<serde_json::Value, String> {
    let clients = state.clients.lock().map_err(|_| "Error interno: mutex MCP envenenado".to_string())?;
    let client = clients.get(&server_name).ok_or_else(|| format!("MCP '{}' no iniciado", server_name))?;
    client.list_tools()
}

#[tauri::command]
async fn mcp_call_tool(state: tauri::State<'_, McpState>, server_name: String, tool_name: String, args: serde_json::Value) -> Result<serde_json::Value, String> {
    let clients = state.clients.lock().map_err(|_| "Error interno: mutex MCP envenenado".to_string())?;
    let client = clients.get(&server_name).ok_or_else(|| format!("MCP '{}' no iniciado", server_name))?;
    client.call_tool(&tool_name, args)
}

// ─── LSP Client Integration ───────────────────────────────────────────────────

pub struct LspState {
    pub clients: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, moset_core::lsp::LspClient>>>,
}

#[tauri::command]
async fn start_lsp_server(state: tauri::State<'_, LspState>, server_name: String, command: String, args: Vec<String>, root_uri: String) -> Result<String, String> {
    let mut clients = state.clients.lock().map_err(|_| "Error interno: mutex LSP envenenado".to_string())?;
    if clients.contains_key(&server_name) {
        return Ok(format!("LSP '{}' ya estaba iniciado", server_name));
    }

    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let client = moset_core::lsp::LspClient::new(&command, &args_refs)?;
    
    client.initialize(&root_uri)?;
    
    clients.insert(server_name.clone(), client);
    Ok(format!("LSP '{}' iniciado correctamente", server_name))
}

#[tauri::command]
async fn lsp_get_diagnostics(state: tauri::State<'_, LspState>, server_name: String, file_uri: String) -> Result<Vec<moset_core::lsp::Diagnostic>, String> {
    let clients = state.clients.lock().map_err(|_| "Error interno: mutex LSP envenenado".to_string())?;
    let client = clients.get(&server_name).ok_or_else(|| format!("LSP '{}' no iniciado", server_name))?;
    Ok(client.get_diagnostics(&file_uri))
}

// ─── GGUF Metadata Manager ──────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct GgufKvEntry {
    key: String,
    value_type: String,
    value: serde_json::Value,
}

fn read_gguf_string(f: &mut std::fs::File) -> Result<String, String> {
    use std::io::Read;
    let mut len_buf = [0u8; 8];
    f.read_exact(&mut len_buf).map_err(|_| "Error leyendo longitud de string".to_string())?;
    let len = u64::from_le_bytes(len_buf) as usize;
    if len > 1_000_000 { return Err("String GGUF demasiado largo.".to_string()); }
    let mut s_buf = vec![0u8; len];
    f.read_exact(&mut s_buf).map_err(|_| "Error leyendo string GGUF".to_string())?;
    Ok(String::from_utf8_lossy(&s_buf).to_string())
}

fn read_gguf_value(f: &mut std::fs::File, vtype: u32) -> Result<(String, serde_json::Value), String> {
    use std::io::Read;
    let mut b1 = [0u8; 1];
    let mut b4 = [0u8; 4];
    let mut b8 = [0u8; 8];
    match vtype {
        0 => { f.read_exact(&mut b1).map_err(|_| "GGUF read u8".to_string())?; Ok(("uint8".into(), serde_json::json!(b1[0]))) },
        1 => { f.read_exact(&mut b1).map_err(|_| "GGUF read i8".to_string())?; Ok(("int8".into(), serde_json::json!(b1[0] as i8))) },
        2 => { let mut b2 = [0u8; 2]; f.read_exact(&mut b2).map_err(|_| "GGUF read u16".to_string())?; Ok(("uint16".into(), serde_json::json!(u16::from_le_bytes(b2)))) },
        3 => { let mut b2 = [0u8; 2]; f.read_exact(&mut b2).map_err(|_| "GGUF read i16".to_string())?; Ok(("int16".into(), serde_json::json!(i16::from_le_bytes(b2)))) },
        4 => { f.read_exact(&mut b4).map_err(|_| "GGUF read u32".to_string())?; Ok(("uint32".into(), serde_json::json!(u32::from_le_bytes(b4)))) },
        5 => { f.read_exact(&mut b4).map_err(|_| "GGUF read i32".to_string())?; Ok(("int32".into(), serde_json::json!(i32::from_le_bytes(b4)))) },
        6 => { f.read_exact(&mut b4).map_err(|_| "GGUF read f32".to_string())?; Ok(("float32".into(), serde_json::json!(f32::from_le_bytes(b4)))) },
        7 => { f.read_exact(&mut b1).map_err(|_| "GGUF read bool".to_string())?; Ok(("bool".into(), serde_json::json!(b1[0] != 0))) },
        8 => { let s = read_gguf_string(f)?; Ok(("string".into(), serde_json::json!(s))) },
        9 => {
            // Array: type(u32) + count(u64) + values
            f.read_exact(&mut b4).map_err(|_| "GGUF read array type".to_string())?;
            let arr_type = u32::from_le_bytes(b4);
            f.read_exact(&mut b8).map_err(|_| "GGUF read array count".to_string())?;
            let arr_count = u64::from_le_bytes(b8) as usize;
            // For large arrays, we now allow them but with a higher safety limit
            if arr_count > 1000000 { return Err("Array GGUF extremadamente grande (>1M). Bloqueado por seguridad de memoria.".to_string()); }

            let mut items = Vec::new();
            for _ in 0..arr_count {
                let (_, val) = read_gguf_value(f, arr_type)?;
                items.push(val);
            }
            Ok(("array".into(), serde_json::json!(items)))
        },
        10 => { f.read_exact(&mut b8).map_err(|_| "GGUF read u64".to_string())?; Ok(("uint64".into(), serde_json::json!(u64::from_le_bytes(b8)))) },
        11 => { f.read_exact(&mut b8).map_err(|_| "GGUF read i64".to_string())?; Ok(("int64".into(), serde_json::json!(i64::from_le_bytes(b8)))) },
        12 => { f.read_exact(&mut b8).map_err(|_| "GGUF read f64".to_string())?; Ok(("float64".into(), serde_json::json!(f64::from_le_bytes(b8)))) },
        _ => Err(format!("Tipo GGUF desconocido: {}", vtype)),
    }
}

#[tauri::command]
async fn read_gguf_metadata(path: String, vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>) -> Result<Vec<GgufKvEntry>, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: {}", e))?;

    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| format!("Error abriendo {}: {}", path, e))?;

    // Read magic
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic).map_err(|e| format!("Error leyendo magic: {}", e))?;
    if &magic != b"GGUF" {
        return Err("No es un archivo GGUF válido (magic header incorrecto).".to_string());
    }

    // Read version
    let mut buf4 = [0u8; 4];
    file.read_exact(&mut buf4).map_err(|e| format!("Error leyendo versión: {}", e))?;
    let version = u32::from_le_bytes(buf4);
    if version < 2 || version > 3 {
        return Err(format!("Versión GGUF no soportada: {}. Se soportan v2 y v3.", version));
    }

    // Read tensor count and metadata KV count
    let mut buf8 = [0u8; 8];
    file.read_exact(&mut buf8).map_err(|_| "Error leyendo tensor_count".to_string())?;
    let _tensor_count = u64::from_le_bytes(buf8);

    file.read_exact(&mut buf8).map_err(|_| "Error leyendo metadata_kv_count".to_string())?;
    let kv_count = u64::from_le_bytes(buf8);

    if kv_count > 10_000 {
        return Err(format!("Demasiados metadatos KV: {}. Límite de seguridad: 10,000.", kv_count));
    }

    let mut entries = Vec::new();
    for _ in 0..kv_count {
        let key = read_gguf_string(&mut file)?;
        let mut type_buf = [0u8; 4];
        file.read_exact(&mut type_buf).map_err(|_| "Error leyendo tipo de valor KV".to_string())?;
        let vtype = u32::from_le_bytes(type_buf);
        let (type_name, value) = read_gguf_value(&mut file, vtype)?;
        entries.push(GgufKvEntry { key, value_type: type_name, value });
    }

    Ok(entries)
}

#[tauri::command]
async fn save_gguf_template(entries: Vec<GgufKvEntry>, output_path: String, vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>) -> Result<String, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&output_path).map_err(|e| format!("Vigilante: {}", e))?;

    let json = serde_json::to_string_pretty(&entries).map_err(|e| format!("Error serializando: {}", e))?;
    std::fs::write(&output_path, &json).map_err(|e| format!("Error escribiendo {}: {}", output_path, e))?;
    Ok(format!("Plantilla guardada en {} ({} entradas, {} bytes)", output_path, entries.len(), json.len()))
}

#[tauri::command]
async fn load_gguf_template(path: String, vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>) -> Result<Vec<GgufKvEntry>, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: {}", e))?;

    let content = std::fs::read_to_string(&path).map_err(|e| format!("Error leyendo {}: {}", path, e))?;
    let entries: Vec<GgufKvEntry> = serde_json::from_str(&content).map_err(|e| format!("Error parseando JSON: {}", e))?;
    Ok(entries)
}

#[tauri::command]
async fn write_gguf_metadata(path: String, entries: Vec<GgufKvEntry>, vig_cfg: tauri::State<'_, std::sync::Mutex<VigilanteConfig>>) -> Result<String, String> {
    let vigilante = make_vigilante(&vig_cfg);
    vigilante.autorizar_ruta(&path).map_err(|e| format!("Vigilante: {}", e))?;

    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("moset_gguf_editor.py");
    let json_path = temp_dir.join("moset_gguf_edits.json");

    let json_data = serde_json::to_string(&entries).map_err(|e| e.to_string())?;
    std::fs::write(&json_path, json_data).map_err(|e| e.to_string())?;

    let py_script = r#"
import sys
import json
import subprocess

model_path = sys.argv[1]
json_path = sys.argv[2]

with open(json_path, "r", encoding="utf-8") as f:
    entries = json.load(f)

for entry in entries:
    key = entry["key"]
    val = entry["value"]
    vtype = entry["value_type"]
    
    # Soporte para tipos simples y Arrays
    if vtype == "array":
        # Para arrays, convertimos a string de valores separados por coma para el script oficial
        # El script oficial de gguf usualmente espera strings o listas segun la version
        # Intentamos pasar el JSON directo del valor si es una lista
        str_val = json.dumps(val)
        print(f"Updating Array {key} (length {len(val)})")
    elif vtype == "bool":
        str_val = str(val).lower()
    else:
        str_val = str(val)

    try:
        print(f"Updating {key} = {str_val[:50]}...")
        # Nota: gguf-set-metadata tiene limitaciones con arrays complejos, 
        # pero para tokens y listas de strings basicas suele funcionar si el entorno tiene la lib gguf instalada.
        subprocess.run([sys.executable, "-m", "gguf.scripts.gguf_set_metadata", "--force", model_path, key, str_val], check=True, capture_output=True)
    except Exception as e:
        print(f"Error updating {key}: {e}")
"#;
    std::fs::write(&script_path, py_script).map_err(|e| e.to_string())?;

    let output = std::process::Command::new("python")
        .arg(&script_path)
        .arg(&path)
        .arg(&json_path)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok("Metadatos inyectados correctamente.".into())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("Error inyectando metadatos: {}", err))
    }
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
            app.manage(Mutex::new(VigilanteConfig::default()));

            app.manage(McpState {
                clients: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            });
            app.manage(LspState {
                clients: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
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
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Limpiar PTY
                let pty_state: tauri::State<'_, PtyState> = window.state();
                if let Ok(mut writer_guard) = pty_state.writer.lock() {
                    *writer_guard = None;
                }
                if let Ok(mut child_guard) = pty_state.child.lock() {
                    if let Some(mut child) = child_guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                };
                if let Ok(mut master_guard) = pty_state.master.lock() {
                    *master_guard = None;
                }
                // Limpiar Motor IA — liberar modelo de RAM/VRAM
                let ai_state: tauri::State<'_, AiState> = window.state();
                if let Ok(mut motor) = ai_state.motor.lock() {
                    motor.descargar();
                }
                
                // Limpiar Cachés de Cuda si está configurado
                if ai_state.clean_cuda_on_exit.load(std::sync::atomic::Ordering::Relaxed) {
                    let _ = clean_cuda_cache();
                }
            } else if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                // Emitir evento global de archivos arrastrados
                let _ = window.emit("global-file-drop", paths);
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            version,
            ejecutar,
            validate_code,
            cargar_modelo,
            chat_orquestado,
            autocomplete_soberano,
            cancel_inference,
            descargar_modelo,
            set_clean_cuda_on_exit,
            tauri_bridge::spawn_pty,
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
            configurar_vigilante,
            list_macros,
            read_macro,
            start_mcp_servers,
            mcp_list_tools,
            mcp_call_tool,
            start_lsp_server,
            lsp_get_diagnostics,
            read_gguf_metadata,
            save_gguf_template,
            load_gguf_template,
            write_gguf_metadata,
            save_chat_sessions,
            load_chat_sessions,
            proyectar_archivo,
            proyectar_codigo,
            dematerializar_codigo,
            dematerializar_y_guardar,
            get_et_dict,
            actualizar_traduccion_dict,
            purgar_et_dict,
            crear_et_dict_por_defecto,
        ])
        .run(tauri::generate_context!())
        .expect("Error iniciando Moset IDE");
}
