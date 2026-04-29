// ============================================================================
// MOSET IDE — Motor de Proyección Bidireccional (.et-dict)
// ============================================================================
// Este módulo gestiona el Diccionario de Proyecto, que permite a cada
// programador ver y escribir código .et en su idioma nativo (variables,
// funciones, moldes), mientras el archivo en disco se mantiene siempre
// en español canónico.
//
// Flujo:
//   Disco (español) → proyectar() → CodeMirror (idioma del usuario)
//   CodeMirror      → dematerializar() → Disco (español)
// ============================================================================

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ─── Tipos ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum IdentTipo {
    Variable,
    Funcion,
    Molde,
    Parametro,
    Campo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentEntry {
    pub tipo: IdentTipo,
    /// Map de código ISO 639-1 → nombre en ese idioma
    /// Ej: { "en": "user_count", "ja": "ユーザー数" }
    pub traducciones: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EtDict {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub proyecto: String,
    pub idioma_canonico: String,
    pub version: u32,
    /// Map de nombre canónico (español) → entry de traducciones
    pub identifiers: HashMap<String, IdentEntry>,
}

impl Default for EtDict {
    fn default() -> Self {
        EtDict {
            schema: "moset-dict/1.0".to_string(),
            proyecto: String::new(),
            idioma_canonico: "es".to_string(),
            version: 1,
            identifiers: HashMap::new(),
        }
    }
}

// ─── Carga y persistencia ───────────────────────────────────────────────────

impl EtDict {
    /// Carga el .et-dict desde el directorio del proyecto.
    /// Si no existe, retorna un dict vacío (no es error).
    pub fn cargar(dir_proyecto: &Path) -> Result<Self, String> {
        let ruta = Self::ruta_dict(dir_proyecto);
        if !ruta.exists() {
            let nombre = dir_proyecto
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("proyecto")
                .to_string();
            return Ok(EtDict {
                proyecto: nombre,
                ..Default::default()
            });
        }
        let contenido = std::fs::read_to_string(&ruta)
            .map_err(|e| format!("Error leyendo .et-dict: {}", e))?;
        serde_json::from_str(&contenido)
            .map_err(|e| format!("Error parseando .et-dict: {}", e))
    }

    /// Guarda el .et-dict al disco, incrementando la versión.
    pub fn guardar(&mut self, dir_proyecto: &Path) -> Result<(), String> {
        self.version += 1;
        let ruta = Self::ruta_dict(dir_proyecto);
        let contenido = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Error serializando .et-dict: {}", e))?;
        std::fs::write(&ruta, contenido)
            .map_err(|e| format!("Error guardando .et-dict: {}", e))
    }

    fn ruta_dict(dir_proyecto: &Path) -> PathBuf {
        dir_proyecto.join(".et-dict")
    }
}

// ─── Proyección directa (español → idioma local) ────────────────────────────

impl EtDict {
    /// Dado un nombre canónico, retorna su traducción al idioma dado.
    /// Si no hay traducción, retorna el canónico.
    pub fn proyectar<'a>(&'a self, canonico: &'a str, idioma: &str) -> &'a str {
        if idioma == "es" || idioma == self.idioma_canonico {
            return canonico;
        }
        self.identifiers
            .get(canonico)
            .and_then(|e| e.traducciones.get(idioma))
            .map(|s| s.as_str())
            .unwrap_or(canonico)
    }

    /// Toma el texto completo de un .et (en español canónico) y devuelve
    /// el texto proyectado al idioma del usuario.
    ///
    /// Estrategia: recorre el texto char a char, detecta tokens de tipo
    /// identificador (palabra), los busca en el dict y los reemplaza.
    /// Los keywords los deja pasar (el Lente Visual del frontend ya los maneja).
    pub fn proyectar_texto(&self, fuente: &str, idioma: &str) -> String {
        if idioma == "es" || self.identifiers.is_empty() {
            return fuente.to_string();
        }

        // Construimos el dict inverso de keywords para no proyectar keywords
        // (el lexer los mapea a tokens, pero aquí trabajamos a nivel de texto)
        let keywords = build_keyword_set();

        let mut resultado = String::with_capacity(fuente.len());
        let chars: Vec<char> = fuente.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            let c = chars[i];

            // ── Inicio de identificador o palabra ──
            if c.is_alphabetic() || c == '_' {
                let inicio = i;
                while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                let palabra: String = chars[inicio..i].iter().collect();

                // No proyectar keywords del lenguaje
                if keywords.contains(palabra.as_str()) {
                    resultado.push_str(&palabra);
                } else {
                    let proyectada = self.proyectar(&palabra, idioma);
                    resultado.push_str(proyectada);
                }
                continue;
            }

            // ── Strings: no proyectar el contenido literal ──
            if c == '"' {
                resultado.push(c);
                i += 1;
                while i < chars.len() && chars[i] != '"' {
                    if chars[i] == '\\' && i + 1 < chars.len() {
                        resultado.push(chars[i]);
                        resultado.push(chars[i + 1]);
                        i += 2;
                    } else {
                        resultado.push(chars[i]);
                        i += 1;
                    }
                }
                if i < chars.len() {
                    resultado.push(chars[i]); // cierre "
                    i += 1;
                }
                continue;
            }

            // ── Comentarios :@ → no proyectar ──
            if c == ':' && i + 1 < chars.len() && chars[i + 1] == '@' {
                while i < chars.len() && chars[i] != '\n' {
                    resultado.push(chars[i]);
                    i += 1;
                }
                continue;
            }

            resultado.push(c);
            i += 1;
        }

        resultado
    }
}

// ─── Dematerialización (idioma local → español canónico) ────────────────────

impl EtDict {
    /// Dado un nombre en idioma local, retorna el nombre canónico en español.
    /// Si no está en el dict, retorna None (es un identificador nuevo).
    pub fn dematerializar<'a>(&'a self, nombre_local: &'a str, idioma: &str) -> Option<&'a str> {
        if idioma == "es" || idioma == self.idioma_canonico {
            // En español el nombre ya ES el canónico
            return Some(nombre_local);
        }
        // Buscar en el dict inverso
        for (canonico, entry) in &self.identifiers {
            if let Some(traduccion) = entry.traducciones.get(idioma) {
                if traduccion == nombre_local {
                    return Some(canonico.as_str());
                }
            }
        }
        None
    }

    /// Toma el texto escrito por el usuario (en su idioma) y devuelve
    /// el texto canónico en español, listo para guardar en disco.
    /// También retorna la lista de identificadores nuevos encontrados.
    pub fn dematerializar_texto(
        &mut self,
        fuente: &str,
        idioma: &str,
    ) -> (String, Vec<String>) {
        if idioma == "es" || idioma == self.idioma_canonico {
            return (fuente.to_string(), vec![]);
        }

        let keywords = build_keyword_set();
        let mut resultado = String::with_capacity(fuente.len());
        let mut nuevos: Vec<String> = Vec::new();
        let chars: Vec<char> = fuente.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            let c = chars[i];

            if c.is_alphabetic() || c == '_' {
                let inicio = i;
                while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                    i += 1;
                }
                let palabra: String = chars[inicio..i].iter().collect();

                if keywords.contains(palabra.as_str()) {
                    // Keyword del lenguaje — el lexer ya la normalizará al token universal.
                    // La copiamos tal cual, el backend Rust la entiende en cualquier idioma.
                    resultado.push_str(&palabra);
                } else {
                    match self.dematerializar(&palabra, idioma) {
                        Some(canonico) => resultado.push_str(canonico),
                        None => {
                            // Identificador nuevo — lo registramos y lo pasamos tal cual
                            if !nuevos.contains(&palabra) {
                                nuevos.push(palabra.clone());
                                self.registrar_nuevo(&palabra, IdentTipo::Variable, idioma);
                            }
                            resultado.push_str(&palabra);
                        }
                    }
                }
                continue;
            }

            // Strings — no dematerializar contenido
            if c == '"' {
                resultado.push(c);
                i += 1;
                while i < chars.len() && chars[i] != '"' {
                    if chars[i] == '\\' && i + 1 < chars.len() {
                        resultado.push(chars[i]);
                        resultado.push(chars[i + 1]);
                        i += 2;
                    } else {
                        resultado.push(chars[i]);
                        i += 1;
                    }
                }
                if i < chars.len() {
                    resultado.push(chars[i]);
                    i += 1;
                }
                continue;
            }

            // Comentarios
            if c == ':' && i + 1 < chars.len() && chars[i + 1] == '@' {
                while i < chars.len() && chars[i] != '\n' {
                    resultado.push(chars[i]);
                    i += 1;
                }
                continue;
            }

            resultado.push(c);
            i += 1;
        }

        (resultado, nuevos)
    }

    /// Registra un nuevo identificador en el dict.
    /// La clave canónica y la única traducción son el mismo nombre por ahora.
    pub fn registrar_nuevo(&mut self, nombre: &str, tipo: IdentTipo, idioma: &str) {
        // Si ya existe como canónico, no pisar
        if self.identifiers.contains_key(nombre) {
            return;
        }
        // Si ya existe como traducción en otro entry, no duplicar
        for entry in self.identifiers.values() {
            if entry.traducciones.get(idioma).map(|s| s.as_str()) == Some(nombre) {
                return;
            }
        }
        let mut traducciones = HashMap::new();
        traducciones.insert(idioma.to_string(), nombre.to_string());
        self.identifiers.insert(
            nombre.to_string(),
            IdentEntry { tipo, traducciones },
        );
    }

    /// Actualiza manualmente la traducción de un identificador.
    /// Usado cuando el usuario confirma un nombre sugerido por IA.
    pub fn actualizar_traduccion(
        &mut self,
        canonico: &str,
        idioma: &str,
        nuevo_nombre: &str,
    ) -> Result<(), String> {
        let entry = self
            .identifiers
            .get_mut(canonico)
            .ok_or_else(|| format!("Identificador '{}' no encontrado en el dict", canonico))?;
        entry.traducciones.insert(idioma.to_string(), nuevo_nombre.to_string());
        Ok(())
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Construye el conjunto de todas las keywords conocidas del lenguaje Moset
/// (en todos los idiomas) para no proyectarlas en el texto.
fn build_keyword_set() -> std::collections::HashSet<&'static str> {
    [
        // Español
        "si", "sino", "mientras", "por", "cada", "en", "molde", "mostrar",
        "importar", "y", "o", "no", "devolver", "pensar", "este",
        "verdadero", "falso", "nulo",
        // Inglés
        "if", "else", "while", "for", "each", "in", "mold", "show",
        "import", "and", "or", "not", "return", "think", "this", "self",
        "true", "false", "null",
        // Portugués
        "se", "senao", "enquanto", "per", "cada", "em", "modello", "mostra",
        "importa", "e", "ou", "nao", "retornar",
        // Francés
        "wenn", "sinon", "tant_que", "pour", "chaque", "dans", "modele",
        "afficher", "importer", "et", "non", "retourner",
        // Alemán
        "sonst", "solange", "fuer", "jeder", "zeigen", "importieren",
        "und", "oder", "nicht", "zurueckgeben",
        // Tokens Moset visuales (no son palabras pero por si acaso)
        "Bit",
    ]
    .iter()
    .copied()
    .collect()
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn dict_con_entradas() -> EtDict {
        let mut d = EtDict::default();
        let mut tr = HashMap::new();
        tr.insert("en".to_string(), "user_count".to_string());
        tr.insert("ja".to_string(), "ユーザー数".to_string());
        d.identifiers.insert(
            "contador_usuarios".to_string(),
            IdentEntry { tipo: IdentTipo::Variable, traducciones: tr },
        );
        let mut tr2 = HashMap::new();
        tr2.insert("en".to_string(), "calculate_total".to_string());
        d.identifiers.insert(
            "calcular_total".to_string(),
            IdentEntry { tipo: IdentTipo::Funcion, traducciones: tr2 },
        );
        d
    }

    #[test]
    fn test_proyectar_nombre() {
        let d = dict_con_entradas();
        assert_eq!(d.proyectar("contador_usuarios", "en"), "user_count");
        assert_eq!(d.proyectar("contador_usuarios", "ja"), "ユーザー数");
        assert_eq!(d.proyectar("contador_usuarios", "es"), "contador_usuarios");
        assert_eq!(d.proyectar("desconocido", "en"), "desconocido");
    }

    #[test]
    fn test_dematerializar_nombre() {
        let d = dict_con_entradas();
        assert_eq!(d.dematerializar("user_count", "en"), Some("contador_usuarios"));
        assert_eq!(d.dematerializar("ユーザー数", "ja"), Some("contador_usuarios"));
        assert_eq!(d.dematerializar("nuevo_ident", "en"), None);
    }

    #[test]
    fn test_proyectar_texto() {
        let d = dict_con_entradas();
        let fuente = "contador_usuarios = calcular_total()";
        let proyectado = d.proyectar_texto(fuente, "en");
        assert_eq!(proyectado, "user_count = calculate_total()");
    }

    #[test]
    fn test_proyectar_texto_respeta_strings() {
        let d = dict_con_entradas();
        let fuente = r#"mostrar "contador_usuarios es un literal""#;
        let proyectado = d.proyectar_texto(fuente, "en");
        // "mostrar" es keyword — no se proyecta; el literal tampoco
        assert_eq!(proyectado, r#"mostrar "contador_usuarios es un literal""#);
    }

    #[test]
    fn test_dematerializar_texto() {
        let mut d = dict_con_entradas();
        let fuente_en = "user_count = calculate_total()";
        let (canonico, nuevos) = d.dematerializar_texto(fuente_en, "en");
        assert_eq!(canonico, "contador_usuarios = calcular_total()");
        assert!(nuevos.is_empty());
    }

    #[test]
    fn test_registrar_nuevo_identificador() {
        let mut d = EtDict::default();
        let (_, nuevos) = d.dematerializar_texto("mi_nueva_var = 42", "en");
        assert_eq!(nuevos.len(), 1);
        assert_eq!(nuevos[0], "mi_nueva_var");
        assert!(d.identifiers.contains_key("mi_nueva_var"));
    }

    #[test]
    fn test_no_proyectar_keywords() {
        let d = dict_con_entradas();
        // "si" es keyword, no debería ser proyectado aunque el dict tuviera entrada
        let fuente = "si x > 0:\n    mostrar contador_usuarios";
        let proyectado = d.proyectar_texto(fuente, "en");
        assert!(proyectado.contains("si"));         // keyword → intacta
        assert!(proyectado.contains("user_count")); // ident → proyectado
    }
}
