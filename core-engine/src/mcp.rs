use std::process::{Command, Child, Stdio};
use std::io::{BufReader, BufRead, Write};
use std::sync::{Arc, Mutex, Condvar};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    pub params: Option<Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<Value>,
    pub error: Option<Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    pub params: Option<Value>,
}

pub struct McpClient {
    child: Child,
    request_id: Arc<Mutex<u64>>,
    response_map: Arc<(Mutex<HashMap<u64, JsonRpcResponse>>, Condvar)>,
    stdin_sender: std::sync::mpsc::Sender<String>,
}

impl Drop for McpClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl McpClient {
    pub fn new(command: &str, args: &[String]) -> Result<Self, String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;

        let child_stdout = child.stdout.take().unwrap();
        let mut child_stdin = child.stdin.take().unwrap();
        
        let response_map = Arc::new((Mutex::new(HashMap::new()), Condvar::new()));
        let response_map_clone = response_map.clone();

        // Thread to read stdout
        std::thread::spawn(move || {
            let reader = BufReader::new(child_stdout);
            for line_res in reader.lines() {
                let l = match line_res {
                    Ok(line) => line,
                    Err(_) => break,
                };
                if let Ok(res) = serde_json::from_str::<JsonRpcResponse>(&l) {
                    let (lock, cvar) = &*response_map_clone;
                    let mut map = lock.lock().unwrap();
                    map.insert(res.id, res);
                    cvar.notify_all();
                }
            }
        });

        // Channel to write stdin safely
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            for msg in rx {
                if writeln!(child_stdin, "{}", msg).is_err() {
                    break;
                }
            }
        });

        Ok(Self {
            child,
            request_id: Arc::new(Mutex::new(0)),
            response_map,
            stdin_sender: tx,
        })
    }

    pub fn send_request(&self, method: &str, params: Option<Value>) -> Result<JsonRpcResponse, String> {
        let id = {
            let mut guard = self.request_id.lock().unwrap();
            *guard += 1;
            *guard
        };

        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        };

        let msg = serde_json::to_string(&req).unwrap();
        self.stdin_sender.send(msg).map_err(|e| e.to_string())?;

        let (lock, cvar) = &*self.response_map;
        let mut map = lock.lock().unwrap();
        let start = std::time::Instant::now();
        let timeout_duration = std::time::Duration::from_secs(10);
        
        loop {
            if let Some(res) = map.remove(&id) {
                return Ok(res);
            }
            
            let elapsed = start.elapsed();
            if elapsed >= timeout_duration {
                return Err(format!("Timeout waiting for MCP response (method: {})", method));
            }
            
            let remaining = timeout_duration - elapsed;
            let result = cvar.wait_timeout(map, remaining).unwrap();
            map = result.0;
            if result.1.timed_out() {
                return Err(format!("Timeout waiting for MCP response (method: {})", method));
            }
        }
    }

    pub fn send_notification(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        let notif = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
        };
        let msg = serde_json::to_string(&notif).unwrap();
        self.stdin_sender.send(msg).map_err(|e| e.to_string())
    }

    pub fn initialize(&self) -> Result<(), String> {
        let params = serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": { "listChanged": true }
            },
            "clientInfo": {
                "name": "Moset IDE",
                "version": "0.1.0"
            }
        });

        let res = self.send_request("initialize", Some(params))?;
        if let Some(e) = res.error {
            return Err(format!("Initialize error: {:?}", e));
        }

        self.send_notification("notifications/initialized", None)?;
        Ok(())
    }

    pub fn list_tools(&self) -> Result<Value, String> {
        let res = self.send_request("tools/list", None)?;
        if let Some(e) = res.error {
            return Err(format!("tools/list error: {:?}", e));
        }
        res.result.ok_or_else(|| "No result in tools/list response".to_string())
    }

    pub fn call_tool(&self, name: &str, args: Value) -> Result<Value, String> {
        let params = serde_json::json!({
            "name": name,
            "arguments": args
        });
        let res = self.send_request("tools/call", Some(params))?;
        if let Some(e) = res.error {
            return Err(format!("tools/call error: {:?}", e));
        }
        res.result.ok_or_else(|| "No result in tools/call response".to_string())
    }
}
