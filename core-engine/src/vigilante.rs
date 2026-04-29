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
// Fase-3: Integración real con VM pendiente (PRE-W01). Métodos reservados.
#[allow(dead_code)]
pub struct Vigilante {
    /// Comandos que NUNCA se ejecutan, sin importar la confianza
    prohibidos: Vec<String>,
    /// Comandos destructivos que requieren confianza ≥ 0.95
    peligrosos: Vec<String>,
    /// Comandos de red/escritura que requieren confianza ≥ 0.75
    cautelosos: Vec<String>,
    /// Rutas del sistema de archivos donde el Soberano tiene acceso
    sandbox_paths: Vec<String>,
}

#[allow(dead_code)]
impl Vigilante {
    /// Crear un Vigilante con las listas de seguridad por defecto
    pub fn nuevo() -> Self {
        Vigilante {
            prohibidos: vec![
                "rm -rf /".into(),
                "rm -rf /*".into(),
                "dd if=/dev/zero".into(),
                "dd if=/dev/random".into(),
                "mkfs".into(),
                ":(){:|:&};:".into(),        // fork bomb
                "format c:".into(),
                "format C:".into(),
                "del /f /s /q C:".into(),
                "rd /s /q C:".into(),
            ],
            peligrosos: vec![
                "rm".into(), "del".into(), "rmdir".into(), "rd".into(),
                "format".into(), "shutdown".into(), "reboot".into(), "halt".into(),
                "poweroff".into(), "kill".into(), "taskkill".into(),
                "chmod".into(), "chown".into(), "iptables".into(),
                "netsh".into(), "reg".into(), "regedit".into(),
            ],
            cautelosos: vec![
                "curl".into(), "wget".into(), "netstat".into(), "nmap".into(),
                "ssh".into(), "scp".into(), "ftp".into(), "nc".into(),
                "python".into(), "node".into(), "cargo".into(), "npm".into(),
                "pip".into(), "powershell".into(), "bash".into(),
            ],
            sandbox_paths: {
                let mut paths = vec![
                    "s:/naraka studio".into(),
                    "s:/data strix".into(),
                ];
                if let Ok(cwd) = std::env::current_dir() {
                    let mut cwd_norm = cwd.to_string_lossy().replace('\\', "/").to_lowercase();
                    if cwd_norm.starts_with("//?/") {
                        cwd_norm = cwd_norm[4..].to_string();
                    }
                    if !paths.contains(&cwd_norm) {
                        paths.push(cwd_norm);
                    }
                }
                paths
            },
        }
    }

    /// Crear un Vigilante desde configuración dinámica (para persistencia en el IDE).
    /// Los campos son listas separadas por comas. Las sandbox_paths se suman a los defaults.
    pub fn nuevo_con_config(
        prohibidos_extra: &str,
        peligrosos_extra: &str,
        cautelosos_extra: &str,
        sandbox_paths_raw: &str,
    ) -> Self {
        let mut base = Self::nuevo();

        // Agregar prohibidos extra
        for s in prohibidos_extra.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
            let sl = s.to_lowercase();
            if !base.prohibidos.iter().any(|p| p == &sl) {
                base.prohibidos.push(sl);
            }
        }
        // Agregar peligrosos extra
        for s in peligrosos_extra.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
            let sl = s.to_lowercase();
            if !base.peligrosos.iter().any(|p| p == &sl) {
                base.peligrosos.push(sl);
            }
        }
        // Agregar cautelosos extra
        for s in cautelosos_extra.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
            let sl = s.to_lowercase();
            if !base.cautelosos.iter().any(|p| p == &sl) {
                base.cautelosos.push(sl);
            }
        }
        // Reemplazar sandbox paths si el usuario configuró los suyos, protegiendo las comas escapadas \,
        let sandbox_trim: Vec<String> = sandbox_paths_raw
            .replace("\\,", "\0")
            .split(',')
            .map(|s| s.replace('\0', ",").trim().replace('\\', "/").to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        if !sandbox_trim.is_empty() {
            base.sandbox_paths = sandbox_trim;
        }
        base
    }

    /// Auditar un comando y emitir un veredicto
    pub fn auditar(&self, comando: &str) -> Veredicto {
        let cmd_lower = comando.to_lowercase();
        // Normalizamos espacios para evitar bypass (ej: "rm  -rf  /")
        let palabras: Vec<&str> = cmd_lower.split_whitespace().collect();
        let cmd_normalized = palabras.join(" ");

        // ⛔ Verificar lista negra absoluta PRIMERO
        for prohibido in &self.prohibidos {
            let prohibido_norm = prohibido.to_lowercase().split_whitespace().collect::<Vec<&str>>().join(" ");
            if cmd_normalized.contains(&prohibido_norm) {
                return Veredicto::Prohibido {
                    razon: format!(
                        "Comando '{}' está en la lista negra del Vigilante. NUNCA se ejecuta.",
                        comando
                    ),
                };
            }
        }

        // 🔴 Verificar comandos peligrosos
        // Revisamos si el comando normalizado contiene la palabra, ignorando comillas
        let sin_comillas = cmd_normalized.replace("\"", "").replace("'", "");
        let palabras_sin_comillas: Vec<&str> = sin_comillas.split_whitespace().collect();
        
        for peligroso in &self.peligrosos {
            let pel_lower = peligroso.to_lowercase();
            if palabras_sin_comillas.contains(&pel_lower.as_str()) || sin_comillas.contains(&pel_lower) {
                return Veredicto::RequiereConfianza {
                    nivel_minimo: 0.95,
                    categoria: format!("🔴 Peligroso ({})", peligroso),
                };
            }
        }

        // 🟡 Verificar comandos cautelosos
        for cauteloso in &self.cautelosos {
            let cau_lower = cauteloso.to_lowercase();
            if palabras_sin_comillas.contains(&cau_lower.as_str()) || sin_comillas.contains(&cau_lower) {
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
    /// Usa sandbox_paths dinámico — configurable desde los ajustes del IDE.
    pub fn autorizar_ruta(&self, ruta: &str) -> Result<(), String> {
        let ruta_normal = ruta.replace('\\', "/");

        // ⛔ Bloquear intentos de Directory Traversal
        // W-004 Fix: Cubrir backslash Windows y URL encoding
        let ruta_decoded = ruta_normal
            .replace("%2e", ".")
            .replace("%2E", ".")
            .replace("%2f", "/")
            .replace("%2F", "/")
            .replace("%5c", "\\")
            .replace("%5C", "\\");
        if ruta_decoded.contains("../") || ruta_decoded.contains("..\\")
        {
            return Err("🛑 Vigilante: PATH TRAVERSAL DETECTADO (Uso de '../'). Acceso denegado.".into());
        }

        // Si la ruta existe, usar su forma canónica para evitar escapes por symlinks
        let path_obj = std::path::Path::new(ruta);
        let check_path = if path_obj.exists() {
            if let Ok(abs) = std::fs::canonicalize(path_obj) {
                let mut p = abs.to_string_lossy().replace('\\', "/").to_lowercase();
                if p.starts_with("//?/") {
                    p = p[4..].to_string();
                }
                p
            } else {
                ruta_normal.to_lowercase()
            }
        } else {
            ruta_normal.to_lowercase()
        };

        // 🟢 Temporales y rutas relativas siempre permitidos
        if check_path.contains("/temp/")
            || check_path.contains("/tmp/")
            || (!check_path.starts_with('/') && !check_path.contains(":/"))
        {
            return Ok(());
        }

        // 🟢 Verificar contra sandbox_paths configurado
        let en_sandbox = self.sandbox_paths.iter().any(|sp| check_path.starts_with(sp.as_str()));
        if en_sandbox {
            Ok(())
        } else {
            let sandboxes = self.sandbox_paths.join(", ");
            Err(format!(
                "🛑 Vigilante: RUTA FUERA DEL SANDBOX ({}).\nNaraka solo tiene jurisdicción sobre: {}.",
                ruta, sandboxes
            ))
        }
    }

    /// Verificar si una variable de entorno es segura para leer.
    /// BUG-060 Fix: Se bloquea el acceso a credenciales o tokens por defecto.
    pub fn auditar_entorno(&self, nombre: &str) -> Result<(), String> {
        let nombre_upper = nombre.to_uppercase();
        
        let allowlist = [
            "HOME", "PATH", "OS", "USER", "TEMP", "TMP", 
            "LOGNAME", "USERNAME", "APPDATA", "LOCALAPPDATA", "USERPROFILE"
        ];

        if allowlist.contains(&nombre_upper.as_str()) {
            return Ok(());
        }

        // Bloquear explícitamente palabras clave sensibles
        let sensibles = ["TOKEN", "KEY", "SECRET", "PASS", "CRED", "AUTH", "AWS", "GCP", "AZURE", "STRIPE"];
        for sensible in sensibles.iter() {
            if nombre_upper.contains(sensible) {
                return Err(format!(
                    "🛑 Vigilante: INTENTO DE ACCESO A SECRETO BLOQUEADO ('{}').",
                    nombre
                ));
            }
        }

        Err(format!(
            "⚠️ Vigilante: Acceso denegado a variable de entorno no estándar ('{}').",
            nombre
        ))
    }

    /// HIGH-002 Fix: Verificar si una URL es segura para peticiones HTTP.
    /// Bloquea accesos a redes internas, metadata de cloud, y localhost.
    pub fn autorizar_url(&self, url: &str) -> Result<(), String> {
        let url_lower = url.to_lowercase();

        // ⛔ Bloquear cloud metadata endpoints (SSRF prevention)
        let bloqueados = [
            "169.254.169.254",    // AWS/GCP metadata
            "metadata.google",     // GCP metadata
            "metadata.internal",   // GCP metadata
            "100.100.100.200",    // Alibaba metadata
        ];
        for bloqueado in &bloqueados {
            if url_lower.contains(bloqueado) {
                return Err(format!(
                    "🛑 Vigilante: SSRF BLOQUEADO — URL apunta a endpoint de metadata interno ('{}')",
                    url
                ));
            }
        }

        // ⛔ Bloquear localhost y redes internas
        let redes_internas = [
            "localhost", "127.0.0.1", "0.0.0.0",
            "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.",
            "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
            "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
            "[::1]", "[::]",
        ];
        // Extraer el host de la URL para comparación
        let host_part = url_lower
            .trim_start_matches("http://")
            .trim_start_matches("https://");
        
        for red in &redes_internas {
            if host_part.starts_with(red) {
                return Err(format!(
                    "🛑 Vigilante: Petición a red interna bloqueada ('{}'). Solo se permiten URLs públicas.",
                    url
                ));
            }
        }

        // ⛔ Solo permitir HTTP/HTTPS
        if !url_lower.starts_with("http://") && !url_lower.starts_with("https://") {
            return Err(format!(
                "⚠️ Vigilante: Protocolo no soportado en URL '{}'. Solo HTTP/HTTPS permitidos.",
                url
            ));
        }

        Ok(())
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

    #[test]
    fn test_autorizar_url_permitidas() {
        let v = Vigilante::nuevo();
        assert!(v.autorizar_url("http://google.com").is_ok());
        assert!(v.autorizar_url("https://api.github.com/v3").is_ok());
        assert!(v.autorizar_url("https://moset.org").is_ok());
    }

    #[test]
    fn test_autorizar_url_bloqueadas_ssrf() {
        let v = Vigilante::nuevo();
        assert!(v.autorizar_url("http://169.254.169.254/latest/meta-data/").is_err());
        assert!(v.autorizar_url("http://metadata.google.internal/").is_err());
        assert!(v.autorizar_url("http://100.100.100.200/").is_err());
    }

    #[test]
    fn test_autorizar_url_bloqueadas_red_interna() {
        let v = Vigilante::nuevo();
        assert!(v.autorizar_url("http://localhost:8080").is_err());
        assert!(v.autorizar_url("https://127.0.0.1").is_err());
        assert!(v.autorizar_url("http://192.168.1.1").is_err());
        assert!(v.autorizar_url("http://10.0.0.1").is_err());
        assert!(v.autorizar_url("http://[::1]").is_err());
    }

    #[test]
    fn test_autorizar_url_protocolos_invalidos() {
        let v = Vigilante::nuevo();
        assert!(v.autorizar_url("ftp://example.com").is_err());
        assert!(v.autorizar_url("file:///etc/passwd").is_err());
        assert!(v.autorizar_url("gopher://server").is_err());
    }
}
