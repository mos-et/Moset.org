use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct LspClient {
    #[allow(dead_code)]
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    diagnostics: Arc<Mutex<HashMap<String, Vec<Diagnostic>>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub message: String,
    pub range: Value,
    pub severity: Option<u8>,
}

impl LspClient {
    pub fn new(command: &str, args: &[&str]) -> Result<Self, String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Error iniciando servidor LSP: {}", e))?;

        let stdin = child.stdin.take().ok_or("No se pudo capturar stdin del LSP")?;
        let stdout = child.stdout.take().ok_or("No se pudo capturar stdout del LSP")?;

        let stdin_arc = Arc::new(Mutex::new(stdin));
        let diagnostics = Arc::new(Mutex::new(HashMap::new()));

        let diag_clone = Arc::clone(&diagnostics);

        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut header = String::new();
                if reader.read_line(&mut header).unwrap_or(0) == 0 {
                    break;
                }
                
                let mut content_length = 0;
                while header != "\r\n" {
                    if let Some(rest) = header.strip_prefix("Content-Length: ") {
                        if let Ok(len) = rest.trim().parse::<usize>() {
                            content_length = len;
                        }
                    }
                    header.clear();
                    if reader.read_line(&mut header).unwrap_or(0) == 0 {
                        break;
                    }
                }

                if content_length > 0 {
                    let mut body = vec![0; content_length];
                    if std::io::Read::read_exact(&mut reader, &mut body).is_ok() {
                        if let Ok(json) = serde_json::from_slice::<Value>(&body) {
                            if let Some(method) = json.get("method").and_then(|m| m.as_str()) {
                                if method == "textDocument/publishDiagnostics" {
                                    if let Some(params) = json.get("params") {
                                        if let Some(uri) = params.get("uri").and_then(|u| u.as_str()) {
                                            if let Some(diags) = params.get("diagnostics").and_then(|d| d.as_array()) {
                                                let parsed_diags: Vec<Diagnostic> = diags.iter().filter_map(|d| {
                                                    serde_json::from_value(d.clone()).ok()
                                                }).collect();
                                                
                                                let mut map = diag_clone.lock().unwrap();
                                                map.insert(uri.to_string(), parsed_diags);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        Ok(LspClient {
            child,
            stdin: stdin_arc,
            diagnostics,
        })
    }

    pub fn initialize(&self, root_uri: &str) -> Result<(), String> {
        let init_req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "processId": std::process::id(),
                "rootUri": root_uri,
                "capabilities": {}
            }
        });
        self.send_request(&init_req)?;
        
        let init_notif = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "initialized",
            "params": {}
        });
        self.send_request(&init_notif)
    }

    fn send_request(&self, req: &Value) -> Result<(), String> {
        let payload = serde_json::to_string(req).unwrap();
        let msg = format!("Content-Length: {}\r\n\r\n{}", payload.len(), payload);
        let mut stdin = self.stdin.lock().unwrap();
        stdin.write_all(msg.as_bytes()).map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())
    }

    pub fn get_diagnostics(&self, file_uri: &str) -> Vec<Diagnostic> {
        let map = self.diagnostics.lock().unwrap();
        map.get(file_uri).cloned().unwrap_or_else(Vec::new)
    }
}
