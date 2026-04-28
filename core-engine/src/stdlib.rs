// ============================================================================
// MOSET — Biblioteca Estándar (Brazos del Sistema)
// ============================================================================
// Funciones nativas que conectan Moset con el hardware.
// Estas son las "manos" del Soberano: I/O, shell, y sistema de archivos.
//
// Seguridad: Todas las llamadas nativas que interactúan con el SO ahora están
// resguardadas por el middleware `Vigilante`, el cual intercepta y valida las rutas,
// variables de entorno y comandos según la configuración de sandbox proporcionada.
//
// Funciones disponibles:
//   shell(Txt)              → Ejecuta comando del SO, sujeto a permisos del Vigilante
//   leer(Txt)               → Lee un archivo, restringido a rutas seguras
//   escribir(Txt, Txt)      → Escribe a un archivo, restringido a rutas seguras
//   existe(Txt)             → Verifica existencia bajo la jurisdicción del sandbox
//   entorno(Txt)            → Lee variables (sujeto a allowlist/blocklist)
// ============================================================================

#[cfg(not(target_arch = "wasm32"))]
use std::process::Command;
#[cfg(not(target_arch = "wasm32"))]
use std::fs;
#[cfg(not(target_arch = "wasm32"))]
use std::env;

#[cfg(not(target_arch = "wasm32"))]
use crate::vigilante::{Vigilante, Veredicto};
#[cfg(target_arch = "wasm32")]
use crate::vigilante::Vigilante;

/// Ejecutar un comando de shell y capturar la salida.
/// Cross-platform: usa `cmd /C` en Windows, `sh -c` en Unix.
///
/// # Ejemplo Moset
/// ```moset
/// resultado = shell("whoami")
/// mostrar resultado
/// ```
#[cfg(not(target_arch = "wasm32"))]
pub fn shell(comando: &str, vigilante: &Vigilante) -> Result<String, String> {
    match vigilante.auditar(comando) {
        Veredicto::Permitido => {}
        Veredicto::RequiereConfianza { nivel_minimo, categoria } => {
            return Err(format!("Vigilante Bloqueado: '{}' requiere nivel de confianza {} (Categoría: {})", comando, nivel_minimo, categoria));
        }
        Veredicto::Prohibido { razon } => {
            return Err(format!("Vigilante PROHIBIDO: {}", razon));
        }
    }

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

#[cfg(target_arch = "wasm32")]
pub fn shell(_comando: &str, _vigilante: &Vigilante) -> Result<String, String> {
    Err("La función 'shell' no está disponible en WebAssembly (WASM).".to_string())
}

/// Leer el contenido completo de un archivo como texto.
///
/// # Ejemplo Moset
/// ```moset
/// config = leer("/etc/hostname")
/// mostrar config
/// ```
#[cfg(not(target_arch = "wasm32"))]
pub fn leer(ruta: &str, vigilante: &Vigilante) -> Result<String, String> {
    vigilante.autorizar_ruta(ruta)?;
    fs::read_to_string(ruta)
        .map_err(|e| format!("Error leyendo '{}': {}", ruta, e))
}

#[cfg(target_arch = "wasm32")]
pub fn leer(_ruta: &str, _vigilante: &Vigilante) -> Result<String, String> {
    Err("La función 'leer' no está disponible en WebAssembly (WASM).".to_string())
}

/// Escribir contenido a un archivo. Crea directorios padres si no existen.
/// Si el archivo existe, lo sobreescribe.
///
/// # Ejemplo Moset
/// ```moset
/// escribir("salida.txt", "Hola desde Moset")
/// ```
#[cfg(not(target_arch = "wasm32"))]
pub fn escribir(ruta: &str, contenido: &str, vigilante: &Vigilante) -> Result<(), String> {
    vigilante.autorizar_ruta(ruta)?;
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

#[cfg(target_arch = "wasm32")]
pub fn escribir(_ruta: &str, _contenido: &str, _vigilante: &Vigilante) -> Result<(), String> {
    Err("La función 'escribir' no está disponible en WebAssembly (WASM).".to_string())
}

/// Verificar si un archivo o directorio existe.
///
/// # Ejemplo Moset
/// ```moset
/// si existe("/etc/passwd"):
///     mostrar "Sistema Unix detectado"
/// ```
#[cfg(not(target_arch = "wasm32"))]
pub fn existe(ruta: &str, vigilante: &Vigilante) -> bool {
    if vigilante.autorizar_ruta(ruta).is_err() {
        return false; // Si está fuera del sandbox, pretendemos que no existe por seguridad
    }
    std::path::Path::new(ruta).exists()
}

#[cfg(target_arch = "wasm32")]
pub fn existe(_ruta: &str, _vigilante: &Vigilante) -> bool {
    false
}

/// Leer una variable de entorno del sistema operativo.
///
/// # Ejemplo Moset
/// ```moset
/// home = entorno("HOME")
/// mostrar home
/// ```
#[cfg(not(target_arch = "wasm32"))]
pub fn entorno(nombre: &str, vigilante: &Vigilante) -> Result<String, String> {
    vigilante.auditar_entorno(nombre)?;
    env::var(nombre)
        .map_err(|_| format!("Variable de entorno '{}' no definida", nombre))
}

#[cfg(target_arch = "wasm32")]
pub fn entorno(nombre: &str, vigilante: &Vigilante) -> Result<String, String> {
    Err(format!("Variable de entorno '{}' no definida en WebAssembly", nombre))
}

/// Realizar una petición HTTP GET.
/// Requiere conexión a internet.
/// HIGH-002 Fix: Ahora requiere autorización del Vigilante para la URL.
///
/// # Ejemplo Moset
/// ```moset
/// respuesta = peticion_get("https://api.github.com")
/// mostrar respuesta
/// ```
#[cfg(all(not(target_arch = "wasm32"), feature = "cloud"))]
pub fn peticion_get(url: &str, vigilante: &Vigilante) -> Result<String, String> {
    // HIGH-002 Fix: Validate URL through Vigilante before making the request
    vigilante.autorizar_url(url)?;
    
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

#[cfg(any(target_arch = "wasm32", not(feature = "cloud")))]
pub fn peticion_get(_url: &str, _vigilante: &Vigilante) -> Result<String, String> {
    Err("Peticiones HTTP no disponibles (requiere feature 'cloud')".into())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    #[test]
    fn test_shell_whoami() {
        let vigilante = Vigilante::nuevo();
        let resultado = shell(if cfg!(target_os = "windows") {
            "whoami"
        } else {
            "echo test"
        }, &vigilante);
        assert!(resultado.is_ok(), "shell debe ejecutar: {:?}", resultado);
        assert!(!resultado.unwrap().is_empty());
    }

    #[test]
    fn test_shell_comando_invalido() {
        let vigilante = Vigilante::nuevo();
        let resultado = shell("comando_que_no_existe_xyz_12345", &vigilante);
        assert!(resultado.is_err());
    }

    #[test]
    fn test_escribir_leer() {
        let ruta = std::env::temp_dir().join("moset_test_brazos.txt");
        let ruta_str = ruta.to_str().unwrap();
        let vigilante = Vigilante::nuevo();

        // Escribir
        let r = escribir(ruta_str, "Hola Soberano", &vigilante);
        assert!(r.is_ok(), "escribir falló: {:?}", r);

        // Leer
        let contenido = leer(ruta_str, &vigilante).unwrap();
        assert_eq!(contenido, "Hola Soberano");

        // Cleanup
        let _ = fs::remove_file(&ruta);
    }

    #[test]
    fn test_leer_archivo_inexistente() {
        let vigilante = Vigilante::nuevo();
        let resultado = leer("/ruta/que/no/existe/abc123.txt", &vigilante);
        assert!(resultado.is_err());
    }

    #[test]
    fn test_existe() {
        let vigilante = Vigilante::nuevo();
        assert!(existe(".", &vigilante));          // directorio actual siempre existe
        assert!(!existe("/ruta_inventada_xyz", &vigilante));
    }

    #[test]
    fn test_entorno() {
        let vigilante = Vigilante::nuevo();
        // Usamos una que casi seguro existe en cualquier OS (HOME, PATH o OS)
        let resultado = entorno("PATH", &vigilante);
        assert!(resultado.is_ok(), "entorno(PATH) falló: {:?}", resultado);
    }

    #[test]
    fn test_entorno_inexistente() {
        let vigilante = Vigilante::nuevo();
        // Esto fallará ahora no porque no exista, sino porque no está en la allowlist
        let resultado = entorno("MOSET_VARIABLE_QUE_NO_EXISTE_XYZ", &vigilante);
        assert!(resultado.is_err());
    }
}
