// ============================================================================
// MOSET — El Vigilante (Security Middleware)
// ============================================================================
// Capa de seguridad que audita TODOS los comandos shell antes de ejecutarlos.
// Clasifica los comandos en niveles de soberanía y exige un Bit de confianza
// proporcional al riesgo del comando.
//
// Niveles de Soberanía:
//   🟢 Libre      (0.00) → Lectura, diagnóstico
//   🟡 Cauteloso   (0.75) → Escritura, red
//   🔴 Peligroso   (0.95) → Destructivo, sistema
//   ⛔ Prohibido   (∞)    → NUNCA permitido
// ============================================================================

/// Veredicto del Vigilante después de auditar un comando
#[derive(Debug, Clone, PartialEq)]
pub enum Veredicto {
    /// Comando libre — no requiere confianza
    Permitido,
    /// Comando requiere un nivel mínimo de confianza (Bit:[prob])
    RequiereConfianza {
        nivel_minimo: f64,
        categoria: String,
    },
    /// Comando prohibido — NUNCA se ejecuta
    Prohibido {
        razon: String,
    },
}

/// El Vigilante: middleware de seguridad para comandos shell
pub struct Vigilante {
    /// Comandos que NUNCA se ejecutan, sin importar la confianza
    prohibidos: Vec<&'static str>,
    /// Comandos destructivos que requieren confianza ≥ 0.95
    peligrosos: Vec<&'static str>,
    /// Comandos de red/escritura que requieren confianza ≥ 0.75
    cautelosos: Vec<&'static str>,
}

impl Vigilante {
    /// Crear un Vigilante con las listas de seguridad por defecto
    pub fn nuevo() -> Self {
        Vigilante {
            prohibidos: vec![
                "rm -rf /",
                "rm -rf /*",
                "dd if=/dev/zero",
                "dd if=/dev/random",
                "mkfs",
                ":(){:|:&};:",        // fork bomb
                "format c:",
                "format C:",
                "del /f /s /q C:",
                "rd /s /q C:",
            ],
            peligrosos: vec![
                "rm",
                "del",
                "rmdir",
                "rd",
                "format",
                "shutdown",
                "reboot",
                "halt",
                "poweroff",
                "kill",
                "taskkill",
                "chmod",
                "chown",
                "iptables",
                "netsh",
                "reg",           // Windows registry
                "regedit",
            ],
            cautelosos: vec![
                "curl",
                "wget",
                "netstat",
                "nmap",
                "ssh",
                "scp",
                "ftp",
                "nc",            // netcat
                "python",
                "node",
                "cargo",
                "npm",
                "pip",
                "powershell",
                "bash",
            ],
        }
    }

    /// Auditar un comando y emitir un veredicto
    pub fn auditar(&self, comando: &str) -> Veredicto {
        let cmd_lower = comando.to_lowercase();
        let cmd_trimmed = cmd_lower.trim();

        // ⛔ Verificar lista negra absoluta PRIMERO
        for prohibido in &self.prohibidos {
            if cmd_trimmed.contains(&prohibido.to_lowercase()) {
                return Veredicto::Prohibido {
                    razon: format!(
                        "Comando '{}' está en la lista negra del Vigilante. NUNCA se ejecuta.",
                        comando
                    ),
                };
            }
        }

        // 🔴 Verificar comandos peligrosos
        // Extraemos el primer "word" del comando para comparar
        let primer_word = cmd_trimmed
            .split_whitespace()
            .next()
            .unwrap_or("");

        for peligroso in &self.peligrosos {
            if primer_word == peligroso.to_lowercase()
                || cmd_trimmed.starts_with(&format!("{} ", peligroso.to_lowercase()))
            {
                return Veredicto::RequiereConfianza {
                    nivel_minimo: 0.95,
                    categoria: format!("🔴 Peligroso ({})", peligroso),
                };
            }
        }

        // 🟡 Verificar comandos cautelosos
        for cauteloso in &self.cautelosos {
            if primer_word == cauteloso.to_lowercase()
                || cmd_trimmed.starts_with(&format!("{} ", cauteloso.to_lowercase()))
            {
                return Veredicto::RequiereConfianza {
                    nivel_minimo: 0.75,
                    categoria: format!("🟡 Cauteloso ({})", cauteloso),
                };
            }
        }

        // 🟢 Todo lo demás es libre
        Veredicto::Permitido
    }

    /// Verificar si un comando puede ejecutarse dado un nivel de confianza
    pub fn autorizar(&self, comando: &str, confianza: Option<f64>) -> Result<(), String> {
        match self.auditar(comando) {
            Veredicto::Permitido => Ok(()),
            Veredicto::RequiereConfianza { nivel_minimo, categoria } => {
                match confianza {
                    Some(c) if c >= nivel_minimo => Ok(()),
                    Some(c) => Err(format!(
                        "⚠️ Vigilante: Comando {} bloqueado.\n\
                         Confianza proporcionada: Bit:[{:.2}] ({:.0}%)\n\
                         Confianza requerida:     Bit:[{:.2}] ({:.0}%)\n\
                         Usá un Bit con mayor certeza para autorizar.",
                        categoria, c, c * 100.0, nivel_minimo, nivel_minimo * 100.0
                    )),
                    None => Err(format!(
                        "⚠️ Vigilante: Comando {} requiere autorización.\n\
                         Confianza requerida: Bit:[{:.2}] ({:.0}%)\n\
                         Uso: shell(comando, Bit:[{:.2}])",
                        categoria, nivel_minimo, nivel_minimo * 100.0, nivel_minimo
                    )),
                }
            }
            Veredicto::Prohibido { razon } => Err(format!(
                "🛑 Vigilante: COMANDO PROHIBIDO\n{}",
                razon
            )),
        }
    }

    /// Verificar si una ruta es segura para modificación por parte del Soberano (IA).
    /// Previene Path Traversal y asegura que solo se toque S:\Naraka Studio o temporales.
    pub fn autorizar_ruta(&self, ruta: &str) -> Result<(), String> {
        let ruta_normal = ruta.replace("\\", "/");
        
        // ⛔ Bloquear intentos de Directory Traversal
        // W-004 Fix: Cubrir backslash Windows y URL encoding
        let ruta_decoded = ruta_normal
            .replace("%2e", ".")
            .replace("%2E", ".")
            .replace("%2f", "/")
            .replace("%2F", "/")
            .replace("%5c", "\\")
            .replace("%5C", "\\");
        if ruta_decoded.contains("../") || ruta_decoded.contains("..\\") {
            return Err("🛑 Vigilante: PATH TRAVERSAL DETECTADO (Uso de '../'). Acceso denegado.".into());
        }

        let ruta_lower = ruta_normal.to_lowercase();
        
        // 🟢 Permitimos solo S:\Naraka Studio, temporales, o relativas puras
        if ruta_lower.starts_with("s:/naraka studio") 
           || ruta_lower.contains("/temp/") 
           || ruta_lower.contains("/tmp/") 
           || (!ruta_lower.starts_with("/") && !ruta_lower.contains(":/")) 
        {
            Ok(())
        } else {
            Err(format!(
                "🛑 Vigilante: RUTA FUERA DEL SANDBOX ({}).\nNaraka solo tiene jurisdicción para modificar archivos dentro de S:\\Naraka Studio o directiorios temporales.", 
                ruta
            ))
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_comando_libre() {
        let v = Vigilante::nuevo();
        let veredicto = v.auditar("whoami");
        assert_eq!(veredicto, Veredicto::Permitido);
    }

    #[test]
    fn test_comando_libre_ls() {
        let v = Vigilante::nuevo();
        assert_eq!(v.auditar("ls -la"), Veredicto::Permitido);
        assert_eq!(v.auditar("echo hola"), Veredicto::Permitido);
        assert_eq!(v.auditar("ping 8.8.8.8"), Veredicto::Permitido);
    }

    #[test]
    fn test_comando_peligroso() {
        let v = Vigilante::nuevo();
        match v.auditar("rm test.txt") {
            Veredicto::RequiereConfianza { nivel_minimo, .. } => {
                assert!((nivel_minimo - 0.95).abs() < 0.001);
            }
            other => panic!("Se esperaba RequiereConfianza, encontré {:?}", other),
        }
    }

    #[test]
    fn test_comando_cauteloso() {
        let v = Vigilante::nuevo();
        match v.auditar("netstat -ano") {
            Veredicto::RequiereConfianza { nivel_minimo, .. } => {
                assert!((nivel_minimo - 0.75).abs() < 0.001);
            }
            other => panic!("Se esperaba RequiereConfianza, encontré {:?}", other),
        }
    }

    #[test]
    fn test_comando_prohibido() {
        let v = Vigilante::nuevo();
        match v.auditar("rm -rf /") {
            Veredicto::Prohibido { .. } => {}, // OK
            other => panic!("Se esperaba Prohibido, encontré {:?}", other),
        }
    }

    #[test]
    fn test_autorizar_libre_sin_confianza() {
        let v = Vigilante::nuevo();
        assert!(v.autorizar("whoami", None).is_ok());
    }

    #[test]
    fn test_autorizar_peligroso_baja_confianza() {
        let v = Vigilante::nuevo();
        let result = v.autorizar("rm test.txt", Some(0.50));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Vigilante"));
    }

    #[test]
    fn test_autorizar_peligroso_alta_confianza() {
        let v = Vigilante::nuevo();
        assert!(v.autorizar("rm test.txt", Some(0.99)).is_ok());
    }

    #[test]
    fn test_autorizar_prohibido_confianza_maxima() {
        let v = Vigilante::nuevo();
        // Ni con confianza 1.0 se puede ejecutar un comando prohibido
        let result = v.autorizar("rm -rf /", Some(1.0));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("PROHIBIDO"));
    }

    #[test]
    fn test_autorizar_cauteloso_suficiente() {
        let v = Vigilante::nuevo();
        assert!(v.autorizar("curl https://api.com", Some(0.80)).is_ok());
    }

    #[test]
    fn test_autorizar_cauteloso_insuficiente() {
        let v = Vigilante::nuevo();
        let result = v.autorizar("curl https://api.com", Some(0.50));
        assert!(result.is_err());
    }

    #[test]
    fn test_autorizar_cauteloso_sin_confianza() {
        let v = Vigilante::nuevo();
        let result = v.autorizar("netstat -ano", None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("requiere autorización"));
    }
}
