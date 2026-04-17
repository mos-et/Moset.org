use std::collections::HashMap;
use crate::ast::Nodo;

// ─── Valores en Runtime ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum Valor {
    Entero(i64),
    Decimal(f64),
    Texto(String),
    Booleano(bool),
    Lista(Vec<Valor>),
    Molde {
        nombre: String,
        campos: HashMap<String, Valor>,    // Corteza: campos fijos del molde
        extra: HashMap<String, Valor>,     // Núcleo: espacio latente (dinámico)
    },
    Funcion {
        nombre: String,
        params: Vec<String>,
        cuerpo: Vec<Nodo>,
    },
    /// Bit Cuántico en superposición: α|0⟩ + β|1⟩
    /// La moneda girando. Solo colapsa cuando se observa con !
    Superposicion {
        alpha: f64, // amplitud para |0⟩ (falso)
        beta: f64,  // amplitud para |1⟩ (verdadero)
    },
    Nulo,
}

impl std::fmt::Display for Valor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Valor::Entero(n) => write!(f, "{}", n),
            Valor::Decimal(n) => write!(f, "{}", n),
            Valor::Texto(s) => write!(f, "{}", s),
            Valor::Booleano(b) => write!(f, "{}", if *b { "verdadero" } else { "falso" }),
            Valor::Lista(items) => {
                write!(f, "[")?;
                for (i, item) in items.iter().enumerate() {
                    if i > 0 { write!(f, ", ")?; }
                    write!(f, "{}", item)?;
                }
                write!(f, "]")
            }
            Valor::Molde { nombre, campos, extra } => {
                write!(f, "{} {{ ", nombre)?;
                let mut first = true;
                for (k, v) in campos.iter() {
                    if !first { write!(f, ", ")?; }
                    write!(f, "{}: {}", k, v)?;
                    first = false;
                }
                // Mostrar espacio latente con prefijo +
                for (k, v) in extra.iter() {
                    if !first { write!(f, ", ")?; }
                    write!(f, "+{}: {}", k, v)?;
                    first = false;
                }
                write!(f, " }}")
            }
            Valor::Funcion { nombre, .. } => write!(f, "<función {}>", nombre),
            Valor::Superposicion { alpha, beta } => {
                let p0 = alpha * alpha;
                let p1 = beta * beta;
                let pct = (p1 * 100.0).round() as usize;
                // Visual probability bar (10 segments)
                let llenos = pct / 10;
                let vacios = 10 - llenos;
                let barra: String = format!(
                    "[{}{}]",
                    "█".repeat(llenos),
                    "░".repeat(vacios)
                );
                // Distinguish Bit:~ (50/50) from Bit:[p]
                let is_uniform = (p0 - 0.5).abs() < 0.001;
                if is_uniform {
                    write!(f, "Bit:~ {} {}%", barra, pct)
                } else {
                    write!(f, "Bit:[{:.2}] {} {}%", p1, barra, pct)
                }
            }
            Valor::Nulo => write!(f, "nulo"),
        }
    }
}
