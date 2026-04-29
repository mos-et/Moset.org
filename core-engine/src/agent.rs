// Código de Fase Futura: Agente autónomo CoT (Soberano AI). Aún no integrado.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// MOSET AGENT - Implementación de Tren de Pensamiento (CoT) XML
// ============================================================================

/// Herramientas disponibles para el agente autónomo (tipado fuerte).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentTool {
    ReadDirectory,
    ReadFile,
    WriteToFile,
    #[serde(alias = "write_file")]
    WriteFile,
    ReplaceFileContent,
    SearchWorkspace,
    RunCommand,
    GitCommit,
    ListProcesses,
    McpListTools,
    McpCallTool,
    LspDiagnostics,
    InjectGgufUi,
}

/// Representa una herramienta invocada por el modelo (IA).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub tool: AgentTool,
    pub args: HashMap<String, serde_json::Value>,
}

/// Representa el resultado devuelto al Agente.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResponse {
    pub tool: String,
    pub status: String,
    pub output: String,
}

#[deprecated(note = "MEJ-7: System prompt is now fully constructed in the frontend (useSoberanoChat.ts). This function is retained only for reference and potential WASM/CLI use.")]
pub fn generar_system_prompt(modo: &str, workspace_root: &str, contexto_extra: Option<&str>, vigilante: &crate::vigilante::Vigilante) -> Result<String, String> {
    let base_agent_path = format!("{}/ai-corpus/prompts/base_agent.md", workspace_root);
    let task_format_path = format!("{}/ai-corpus/prompts/task_format.md", workspace_root);

    vigilante.autorizar_ruta(&base_agent_path)?;
    let mut prompt = match std::fs::read_to_string(&base_agent_path) {
        Ok(content) => content,
        Err(_) => return Err("Error: No se pudo cargar base_agent.md".into()),
    };

    if vigilante.autorizar_ruta(&task_format_path).is_ok() {
        if let Ok(content) = std::fs::read_to_string(&task_format_path) {
            prompt.push('\n');
            prompt.push_str(&content);
        }
    }

    prompt.push('\n');
    prompt.push_str(&format!("Modo actual: {}\n", modo));
    prompt.push_str(&format!("Raíz del proyecto (Workspace): {}\n\n", workspace_root));
    
    if let Some(ctx) = contexto_extra {
        if !ctx.trim().is_empty() {
            prompt.push_str("--- CONTEXTO ADICIONAL APORTADO POR EL USUARIO ---\n");
            prompt.push_str("```\n");
            prompt.push_str(ctx);
            prompt.push_str("\n```\n");
        }
    }

    Ok(prompt)
}

pub fn validar_herramienta_fs(tool: &AgentTool, arg_path: &str, vigilante: &crate::vigilante::Vigilante) -> Result<(), String> {
    match tool {
        AgentTool::ReadFile | AgentTool::ReadDirectory | AgentTool::WriteToFile | AgentTool::WriteFile | AgentTool::ReplaceFileContent => {
            if let Err(e) = vigilante.autorizar_ruta(arg_path) {
                return Err(format!("Vigilante: Acceso denegado a la ruta {} - {}", arg_path, e));
            }
            Ok(())
        },
        _ => Ok(()) // Otras herramientas no son de filesystem, o se validan en otro nivel
    }
}
