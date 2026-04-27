use std::collections::HashMap;
use std::rc::Rc;

use std::cell::RefCell;

// ─── Valores en Runtime ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct InstanciaMolde {
    pub nombre: String,
    pub campos: HashMap<String, Valor>,
    pub extra: HashMap<String, Valor>,
}

#[derive(Debug, Clone)]
pub enum Valor {
    Entero(i64),
    Decimal(f64),
    Texto(String),
    Booleano(bool),
    Lista(Rc<RefCell<Vec<Valor>>>),
    Molde(Rc<RefCell<InstanciaMolde>>),
    Funcion {
        nombre: String,
        arity: usize,
        chunk: Rc<crate::bytecode::Chunk>,
    },
    Closure {
        arity: usize,
        chunk: Rc<crate::bytecode::Chunk>,
        capturas: Vec<Valor>,
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
            Valor::Lista(rc_items) => {
                let items = rc_items.borrow();
                write!(f, "[")?;
                for (i, item) in items.iter().enumerate() {
                    if i > 0 { write!(f, ", ")?; }
                    write!(f, "{}", item)?;
                }
                write!(f, "]")
            }
            Valor::Molde(rc_instancia) => {
                let inst = rc_instancia.borrow();
                write!(f, "{} {{ ", inst.nombre)?;
                let mut first = true;
                for (k, v) in inst.campos.iter() {
                    if !first { write!(f, ", ")?; }
                    write!(f, "{}: {}", k, v)?;
                    first = false;
                }
                // Mostrar espacio latente con prefijo +
                for (k, v) in inst.extra.iter() {
                    if !first { write!(f, ", ")?; }
                    write!(f, "+{}: {}", k, v)?;
                    first = false;
                }
                write!(f, " }}")
            }
            Valor::Funcion { nombre, arity, .. } => write!(f, "<fun {} ({} params)>", nombre, arity),
            Valor::Closure { arity, .. } => write!(f, "<closure ({} params)>", arity),
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
