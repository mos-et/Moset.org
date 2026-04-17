// ============================================================================
// MOSET — Biblioteca Estándar (Brazos del Sistema)
// ============================================================================
// Funciones nativas que conectan Moset con el hardware.
// Estas son las "manos" del Soberano: I/O, shell, y sistema de archivos.
//
// Seguridad: En Fase 2 se implementará un sandbox con niveles de permiso.
// Por ahora, el Soberano tiene acceso total (como root).
//
// Funciones disponibles:
//   shell(Txt)              → Ejecuta comando del SO, devuelve stdout
//   leer(Txt)               → Lee un archivo, devuelve contenido como Txt
//   escribir(Txt, Txt)      → Escribe contenido a un archivo
//   existe(Txt)             → Verifica si un archivo/directorio existe
//   entorno(Txt)            → Lee una variable de entorno
// ============================================================================

use std::process::Command;
use std::fs;
use std::env;

/// Ejecutar un comando de shell y capturar la salida.
/// Cross-platform: usa `cmd /C` en Windows, `sh -c` en Unix.
///
/// # Ejemplo Moset
/// ```moset
/// resultado = shell("whoami")
/// mostrar resultado
/// ```
pub fn shell(comando: &str) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", comando])
            .output()
    } else {
        Command::new("sh")
            .args(["-c", comando])
            .output()
    };

    let output = output.map_err(|e| {
        format!("Error ejecutando shell '{}': {}", comando, e)
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout.trim_end().to_string())
    } else {
        let codigo = output.status.code().unwrap_or(-1);
        if stderr.is_empty() {
            Err(format!("Shell falló (código {}): {}", codigo, stdout.trim()))
        } else {
            Err(format!("Shell falló (código {}): {}", codigo, stderr.trim()))
        }
    }
}

/// Leer el contenido completo de un archivo como texto.
///
/// # Ejemplo Moset
/// ```moset
/// config = leer("/etc/hostname")
/// mostrar config
/// ```
pub fn leer(ruta: &str) -> Result<String, String> {
    fs::read_to_string(ruta)
        .map_err(|e| format!("Error leyendo '{}': {}", ruta, e))
}

/// Escribir contenido a un archivo. Crea directorios padres si no existen.
/// Si el archivo existe, lo sobreescribe.
///
/// # Ejemplo Moset
/// ```moset
/// escribir("salida.txt", "Hola desde Moset")
/// ```
pub fn escribir(ruta: &str, contenido: &str) -> Result<(), String> {
    // Crear directorios padres si son necesarios
    if let Some(padre) = std::path::Path::new(ruta).parent() {
        if !padre.as_os_str().is_empty() {
            fs::create_dir_all(padre)
                .map_err(|e| format!("Error creando directorio para '{}': {}", ruta, e))?;
        }
    }
    fs::write(ruta, contenido)
        .map_err(|e| format!("Error escribiendo '{}': {}", ruta, e))
}

/// Verificar si un archivo o directorio existe.
///
/// # Ejemplo Moset
/// ```moset
/// si existe("/etc/passwd"):
///     mostrar "Sistema Unix detectado"
/// ```
pub fn existe(ruta: &str) -> bool {
    std::path::Path::new(ruta).exists()
}

/// Leer una variable de entorno del sistema operativo.
///
/// # Ejemplo Moset
/// ```moset
/// home = entorno("HOME")
/// mostrar home
/// ```
pub fn entorno(nombre: &str) -> Result<String, String> {
    env::var(nombre)
        .map_err(|_| format!("Variable de entorno '{}' no definida", nombre))
}

/// Realizar una petición HTTP GET.
/// Requiere conexión a internet.
///
/// # Ejemplo Moset
/// ```moset
/// respuesta = peticion_get("https://api.github.com")
/// mostrar respuesta
/// ```
#[cfg(not(target_arch = "wasm32"))]
pub fn peticion_get(url: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Moset/1.0 (Naraka Studio)")
        .build()
        .map_err(|e| e.to_string())?;

    client.get(url)
        .send()
        .map_err(|e| format!("Falló petición a '{}': {}", url, e))?
        .text()
        .map_err(|e| format!("Falló extraer cuerpo: {}", e))
}

#[cfg(target_arch = "wasm32")]
pub fn peticion_get(_url: &str) -> Result<String, String> {
    Err("Peticiones HTTP síncronas no están disponibles en la web (WASM)".into())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shell_whoami() {
        let resultado = shell(if cfg!(target_os = "windows") {
            "whoami"
        } else {
            "echo test"
        });
        assert!(resultado.is_ok(), "shell debe ejecutar: {:?}", resultado);
        assert!(!resultado.unwrap().is_empty());
    }

    #[test]
    fn test_shell_comando_invalido() {
        let resultado = shell("comando_que_no_existe_xyz_12345");
        assert!(resultado.is_err());
    }

    #[test]
    fn test_escribir_leer() {
        let ruta = std::env::temp_dir().join("moset_test_brazos.txt");
        let ruta_str = ruta.to_str().unwrap();

        // Escribir
        let r = escribir(ruta_str, "Hola Soberano");
        assert!(r.is_ok(), "escribir falló: {:?}", r);

        // Leer
        let contenido = leer(ruta_str).unwrap();
        assert_eq!(contenido, "Hola Soberano");

        // Cleanup
        let _ = fs::remove_file(&ruta);
    }

    #[test]
    fn test_leer_archivo_inexistente() {
        let resultado = leer("/ruta/que/no/existe/abc123.txt");
        assert!(resultado.is_err());
    }

    #[test]
    fn test_existe() {
        assert!(existe("."));          // directorio actual siempre existe
        assert!(!existe("/ruta_inventada_xyz"));
    }

    #[test]
    fn test_entorno() {
        // PATH siempre existe en ambos SO
        let resultado = entorno("PATH");
        assert!(resultado.is_ok());
        assert!(!resultado.unwrap().is_empty());
    }

    #[test]
    fn test_entorno_inexistente() {
        let resultado = entorno("MOSET_VARIABLE_QUE_NO_EXISTE_XYZ");
        assert!(resultado.is_err());
    }
}
