use std::sync::Mutex;
use tauri::State;

// ─── Vigilante Config Global ───────────────────────────────────────────────────
// Permite que la configuración de la UI llegue al backend Rust en runtime.

pub struct VigilanteConfig {
    pub prohibidos: String,
    pub peligrosos: String,
    pub cautelosos: String,
    pub sandbox_paths: String,
}

impl Default for VigilanteConfig {
    fn default() -> Self {
        VigilanteConfig {
            prohibidos: String::new(),
            peligrosos: String::new(),
            cautelosos: String::new(),
            sandbox_paths: String::new(),
        }
    }
}

/// Helper: construye un Vigilante usando la config guardada en el estado global.
pub fn make_vigilante(vig_cfg: &State<'_, Mutex<VigilanteConfig>>) -> moset_core::vigilante::Vigilante {
    if let Ok(cfg) = vig_cfg.lock() {
        moset_core::vigilante::Vigilante::nuevo_con_config(
            &cfg.prohibidos,
            &cfg.peligrosos,
            &cfg.cautelosos,
            &cfg.sandbox_paths,
        )
    } else {
        moset_core::vigilante::Vigilante::nuevo()
    }
}

#[tauri::command]
pub fn configurar_vigilante(
    state: State<'_, Mutex<VigilanteConfig>>,
    prohibidos: String,
    peligrosos: String,
    cautelosos: String,
    sandbox_paths: String,
) {
    if let Ok(mut cfg) = state.lock() {
        cfg.prohibidos = prohibidos;
        cfg.peligrosos = peligrosos;
        cfg.cautelosos = cautelosos;
        cfg.sandbox_paths = sandbox_paths;
    }
}
