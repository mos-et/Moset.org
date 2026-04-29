///////////////////////////////////////////////////////////////////////////////
// MOSET VM — Máquina Virtual de Pila (Stack Machine)
///////////////////////////////////////////////////////////////////////////////
// Diseñada para máxima velocidad, utilizando un loop infinito inline
// sobre una pila `Vec<Valor>`.
///////////////////////////////////////////////////////////////////////////////

use crate::bytecode::{Chunk, OpCode};
use crate::valor::Valor;
use std::collections::HashMap;

// Límite sano de memoria contigua
const MAX_PILA: usize = 256; 
const MAX_FRAMES: usize = 64;

/// Frame de llamada para funciones
#[derive(Debug)]
struct CallFrame {
    /// Offset base en la pila para este frame
    base_pila: usize,
    /// IP de retorno (a dónde volver en el chunk del caller)
    ip_retorno: usize,
    /// Chunk de la función llamadora
    chunk: Chunk,
    /// Entorno de capturas del caller
    capturas: Vec<Valor>,
    /// Objeto 'este' del caller (para métodos)
    este: Option<Valor>,
}

pub type PrintCallback = Box<dyn FnMut(&str) + Send + Sync>;

#[derive(Debug, Clone, PartialEq)]
pub enum EstadoVM {
    Terminado(Valor),
    Suspendido(Valor),
}

pub struct VM {
    chunk: Chunk,
    ip: usize,
    pila: Vec<Valor>,
    pub globales: HashMap<String, Valor>,
    frames: Vec<CallFrame>,
    pub on_print: Option<PrintCallback>,
    pub vigilante: std::rc::Rc<crate::vigilante::Vigilante>,
    pub capturas: Vec<Valor>,
    pub este: Option<Valor>,
    base_pila: usize,
    /// Stack de handlers para CatchEnLinea (reservado para implementación completa)
    #[allow(dead_code)]
    handlers_catch: Vec<(usize, usize, usize)>, // (ip_handler, pila_size, frames_len)
}

impl VM {
    pub fn nueva(chunk: Chunk) -> Self {
        VM {
            chunk,
            ip: 0,
            pila: Vec::with_capacity(MAX_PILA),
            globales: HashMap::new(),
            frames: Vec::with_capacity(MAX_FRAMES),
            on_print: None,
            vigilante: std::rc::Rc::new(crate::vigilante::Vigilante::nuevo()),
            capturas: Vec::new(),
            este: None,
            base_pila: 0,
            handlers_catch: Vec::new(),
        }
    }

    // MED-002 Fix: Enforce stack depth limit to prevent unbounded memory growth
    #[inline(always)]
    fn push(&mut self, valor: Valor) -> Result<(), String> {
        if self.pila.len() >= MAX_PILA {
            return Err("Stack Overflow: Límite máximo de la pila alcanzado".into());
        }
        self.pila.push(valor);
        Ok(())
    }

    #[inline(always)]
    fn pop(&mut self) -> Result<Valor, String> {
        self.pila.pop().ok_or_else(|| "Stack Underflow: Pila vacía al intentar hacer pop".to_string())
    }

    #[inline(always)]
    fn peek(&self, distance: usize) -> Result<&Valor, String> {
        if self.pila.len() <= distance {
            return Err("Stack Underflow en peek".to_string());
        }
        Ok(&self.pila[self.pila.len() - 1 - distance])
    }

    #[inline(always)]
    fn leer_constante(&self, idx: usize) -> Result<&Valor, String> {
        self.chunk.constantes.get(idx).ok_or_else(|| format!("Índice de constante fuera de rango: {}", idx))
    }


    /// Evalúa si un valor es "falsy" en la semántica Moset
    fn es_falso(valor: &Valor) -> bool {
        match valor {
            Valor::Nulo => true,
            Valor::Booleano(b) => !b,
            Valor::Entero(0) => true,
            _ => false,
        }
    }

    pub fn reanudar(&mut self, valor_resuelto: Valor) -> Result<EstadoVM, String> {
        self.push(valor_resuelto)?;
        self.ejecutar()
    }

    pub fn ejecutar(&mut self) -> Result<EstadoVM, String> {
        let mut instruction_count: u64 = 0;
        const MAX_INSTRUCTIONS: u64 = 5_000_000;
        loop {
            instruction_count += 1;
            if instruction_count > MAX_INSTRUCTIONS {
                return Err("ERR_LIMIT: Límite de ejecución excedido (Seguridad contra bucles infinitos - BUG-022)".to_string());
            }
            if self.ip >= self.chunk.codigo.len() {
                return Ok(EstadoVM::Terminado(Valor::Nulo)); // Fin seguro
            }
            let instruccion = self.leer_byte()?;
            let op: OpCode = instruccion.into();

            let resultado_paso = (|| -> Result<Option<EstadoVM>, String> {
                match op {
                    // ─── CONSTANTES ─────────────────────────────────────
                    OpCode::Constante => {
                    let indice = self.leer_u16()? as usize;
                    let constante = self.leer_constante(indice)?.clone();
                    self.push(constante)?;
                },

                // ─── ARITMÉTICA ─────────────────────────────────────
                OpCode::Suma => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (&a, &b) {
                        (Valor::Entero(x), Valor::Entero(y)) => {
                            if let Some(r) = x.checked_add(*y) {
                                Valor::Entero(r)
                            } else {
                                return Err("Desbordamiento en suma de enteros".into());
                            }
                        },
                        (Valor::Decimal(x), Valor::Decimal(y)) => Valor::Decimal(x + y),
                        (Valor::Entero(x), Valor::Decimal(y)) => Valor::Decimal(*x as f64 + y),
                        (Valor::Decimal(x), Valor::Entero(y)) => Valor::Decimal(x + *y as f64),
                        // Concatenación de texto automática
                        (Valor::Texto(s1), Valor::Texto(s2)) => Valor::Texto(format!("{}{}", s1, s2)),
                        (Valor::Texto(s), _) => Valor::Texto(format!("{}{}", s, b)),
                        (_, Valor::Texto(s)) => Valor::Texto(format!("{}{}", a, s)),
                        _ => return Err(format!("No se puede sumar {:?} + {:?}", a, b)),
                    };
                    self.push(res)?;
                },
                OpCode::Resta => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => {
                            if let Some(r) = x.checked_sub(y) {
                                Valor::Entero(r)
                            } else {
                                return Err("Desbordamiento en resta de enteros".into());
                            }
                        },
                        (Valor::Decimal(x), Valor::Decimal(y)) => Valor::Decimal(x - y),
                        (Valor::Entero(x), Valor::Decimal(y)) => Valor::Decimal(x as f64 - y),
                        (Valor::Decimal(x), Valor::Entero(y)) => Valor::Decimal(x - y as f64),
                        _ => return Err("Operadores inválidos para resta".into()),
                    };
                    self.push(res)?;
                },
                OpCode::Multiplicacion => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => {
                            if let Some(r) = x.checked_mul(y) {
                                Valor::Entero(r)
                            } else {
                                return Err("Desbordamiento en multiplicación de enteros".into());
                            }
                        },
                        (Valor::Decimal(x), Valor::Decimal(y)) => Valor::Decimal(x * y),
                        (Valor::Entero(x), Valor::Decimal(y)) => Valor::Decimal(x as f64 * y),
                        (Valor::Decimal(x), Valor::Entero(y)) => Valor::Decimal(x * y as f64),
                        _ => return Err("Operadores inválidos para multiplicación".into()),
                    };
                    self.push(res)?;
                },
                OpCode::Division => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => {
                            if y == 0 { return Err("División por cero".into()); }
                            if let Some(r) = x.checked_div(y) {
                                Valor::Entero(r)
                            } else {
                                return Err("Desbordamiento en división de enteros".into());
                            }
                        },
                        (Valor::Decimal(x), Valor::Decimal(y)) => {
                            if y == 0.0 { return Err("División por cero".into()); }
                            Valor::Decimal(x / y)
                        },
                        (Valor::Entero(x), Valor::Decimal(y)) => {
                            if y == 0.0 { return Err("División por cero".into()); }
                            Valor::Decimal(x as f64 / y)
                        },
                        (Valor::Decimal(x), Valor::Entero(y)) => {
                            if y == 0 { return Err("División por cero".into()); }
                            Valor::Decimal(x / y as f64)
                        },
                        _ => return Err("Operadores inválidos para división".into()),
                    };
                    self.push(res)?;
                },
                OpCode::Modulo => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => {
                            if y == 0 { return Err("Módulo por cero".into()); }
                            if let Some(r) = x.checked_rem(y) {
                                Valor::Entero(r)
                            } else {
                                return Err("Desbordamiento en módulo de enteros".into());
                            }
                        },
                        _ => return Err("Módulo solo soporta enteros".into()),
                    };
                    self.push(res)?;
                },

                // ─── NEGACIÓN ───────────────────────────────────────
                OpCode::Negacion => {
                    let val = self.pop()?;
                    let res = match val {
                        Valor::Entero(n) => {
                            if let Some(r) = n.checked_neg() {
                                Valor::Entero(r)
                            } else {
                                return Err("Desbordamiento en negación de entero".into());
                            }
                        },
                        Valor::Decimal(n) => Valor::Decimal(-n),
                        _ => return Err("No se puede negar este valor".into()),
                    };
                    self.push(res)?;
                },

                // ─── BOOLEANOS / NULO ───────────────────────────────
                OpCode::Verdadero => self.push(Valor::Booleano(true))?,
                OpCode::Falso => self.push(Valor::Booleano(false))?,
                OpCode::Nulo => self.push(Valor::Nulo)?,

                // ─── LÓGICA ─────────────────────────────────────────
                OpCode::No => {
                    let val = self.pop()?;
                    self.push(Valor::Booleano(Self::es_falso(&val)))?;
                },

                // ─── COMPARACIONES ──────────────────────────────────
                OpCode::Igual => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (&a, &b) {
                        (Valor::Entero(x), Valor::Entero(y)) => x == y,
                        (Valor::Decimal(x), Valor::Decimal(y)) => x == y,
                        (Valor::Texto(x), Valor::Texto(y)) => x == y,
                        (Valor::Booleano(x), Valor::Booleano(y)) => x == y,
                        (Valor::Nulo, Valor::Nulo) => true,
                        _ => false,
                    };
                    self.push(Valor::Booleano(res))?;
                },
                OpCode::NoIgual => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (&a, &b) {
                        (Valor::Entero(x), Valor::Entero(y)) => x != y,
                        (Valor::Decimal(x), Valor::Decimal(y)) => x != y,
                        (Valor::Texto(x), Valor::Texto(y)) => x != y,
                        (Valor::Booleano(x), Valor::Booleano(y)) => x != y,
                        (Valor::Nulo, Valor::Nulo) => false,
                        _ => true,
                    };
                    self.push(Valor::Booleano(res))?;
                },
                OpCode::Mayor => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => x > y,
                        (Valor::Decimal(x), Valor::Decimal(y)) => x > y,
                        (Valor::Entero(x), Valor::Decimal(y)) => (x as f64) > y,
                        (Valor::Decimal(x), Valor::Entero(y)) => x > y as f64,
                        _ => return Err("Comparación inválida (>)".into()),
                    };
                    self.push(Valor::Booleano(res))?;
                },
                OpCode::Menor => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => x < y,
                        (Valor::Decimal(x), Valor::Decimal(y)) => x < y,
                        (Valor::Entero(x), Valor::Decimal(y)) => (x as f64) < y,
                        (Valor::Decimal(x), Valor::Entero(y)) => x < y as f64,
                        _ => return Err("Comparación inválida (<)".into()),
                    };
                    self.push(Valor::Booleano(res))?;
                },
                OpCode::MayorIgual => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => x >= y,
                        (Valor::Decimal(x), Valor::Decimal(y)) => x >= y,
                        (Valor::Entero(x), Valor::Decimal(y)) => (x as f64) >= y,
                        (Valor::Decimal(x), Valor::Entero(y)) => x >= y as f64,
                        _ => return Err("Comparación inválida (>=)".into()),
                    };
                    self.push(Valor::Booleano(res))?;
                },
                OpCode::MenorIgual => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => x <= y,
                        (Valor::Decimal(x), Valor::Decimal(y)) => x <= y,
                        (Valor::Entero(x), Valor::Decimal(y)) => (x as f64) <= y,
                        (Valor::Decimal(x), Valor::Entero(y)) => x <= y as f64,
                        _ => return Err("Comparación inválida (<=)".into()),
                    };
                    self.push(Valor::Booleano(res))?;
                },

                // ─── CONCATENAR TEXTO ───────────────────────────────
                OpCode::Concatenar => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    self.push(Valor::Texto(format!("{}{}", a, b)))?;
                },

                // ─── IMPRIMIR ───────────────────────────────────────
                OpCode::Imprimir => {
                    let val = self.pop()?;
                    if let Some(cb) = &mut self.on_print {
                        cb(&format!("{}", val));
                    } else {
                        println!("{}", val);
                    }
                    self.push(Valor::Nulo)?;
                },

                // ─── PILA ───────────────────────────────────────────
                OpCode::Pop => {
                    self.pop()?;
                },

                // ─── VARIABLES GLOBALES ─────────────────────────────
                OpCode::DefinirGlobal => {
                    let idx = self.leer_u16()? as usize;
                    let nombre = match self.leer_constante(idx)? {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de variable global no es texto".into()),
                    };
                    let valor = self.pop()?;
                    self.globales.insert(nombre, valor);
                },
                OpCode::ObtenerGlobal => {
                    let idx = self.leer_u16()? as usize;
                    let nombre = match self.leer_constante(idx)? {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de variable global no es texto".into()),
                    };
                    match self.globales.get(&nombre) {
                        Some(val) => self.push(val.clone())?,
                        None => return Err(format!("Variable global no definida: '{}'", nombre)),
                    };
                },
                OpCode::AsignarGlobal => {
                    let idx = self.leer_u16()? as usize;
                    let nombre = match self.leer_constante(idx)? {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de variable global no es texto".into()),
                    };
                    if !self.globales.contains_key(&nombre) {
                        return Err(format!("Variable global no definida al asignar: '{}'", nombre));
                    }
                    // Peek para no consumir el valor (la asignación es una expresión)
                    let valor = self.peek(0)?.clone();
                    self.globales.insert(nombre, valor);
                },

                // ─── VARIABLES LOCALES ──────────────────────────────
                OpCode::ObtenerLocal => {
                    let slot = self.leer_byte()? as usize;
                    let idx = self.base_pila + slot;
                    if idx >= self.pila.len() {
                        return Err(format!("Slot local fuera de rango: {}", idx));
                    }
                    let valor = self.pila[idx].clone();
                    self.push(valor)?;
                },
                OpCode::AsignarLocal => {
                    let slot = self.leer_byte()? as usize;
                    let idx = self.base_pila + slot;
                    let valor = self.peek(0)?.clone();
                    if idx >= self.pila.len() {
                        return Err(format!("Slot local fuera de rango: {}", idx));
                    }
                    self.pila[idx] = valor;
                },

                // ─── SALTOS ─────────────────────────────────────────
                OpCode::Salto => {
                    let offset = self.leer_u16()? as usize;
                    self.ip += offset;
                },
                OpCode::SaltoSiFalso => {
                    let offset = self.leer_u16()? as usize;
                    let condicion = self.peek(0)?;
                    if Self::es_falso(condicion) {
                        self.ip += offset;
                    }
                },
                OpCode::Bucle => {
                    let offset = self.leer_u16()? as usize;
                    self.ip -= offset;
                },

                // ─── LLAMADAS A FUNCIÓN ─────────────────────────────
                OpCode::Llamar => {
                    let arg_count = self.leer_byte()? as usize;
                    if self.pila.len() < 1 + arg_count {
                        return Err(format!("Pila insuficiente para Llamar: necesita {}, tiene {}", 1 + arg_count, self.pila.len()));
                    }
                    let func_slot = self.pila.len() - 1 - arg_count;
                    let func = self.pila[func_slot].clone();

                    match func {
                        Valor::Funcion { arity, chunk, .. } => {
                            if arity != arg_count {
                                return Err(format!("Función esperaba {} argumentos, recibió {}", arity, arg_count));
                            }
                            if self.frames.len() >= MAX_FRAMES {
                                return Err("Stack Overflow".into());
                            }
                            let frame = CallFrame {
                                base_pila: self.base_pila,
                                ip_retorno: self.ip,
                                chunk: self.chunk.clone(),
                                capturas: self.capturas.clone(),
                                este: self.este.clone(),
                            };
                            self.frames.push(frame);
                            self.chunk = (*chunk).clone();
                            self.ip = 0;
                            self.base_pila = self.pila.len() - arg_count;
                            self.capturas = Vec::new();
                        },
                        Valor::Closure { arity, chunk, capturas } => {
                            if arity != arg_count {
                                return Err(format!("Closure esperaba {} argumentos, recibió {}", arity, arg_count));
                            }
                            if self.frames.len() >= MAX_FRAMES {
                                return Err("Stack Overflow".into());
                            }
                            let frame = CallFrame {
                                base_pila: self.base_pila,
                                ip_retorno: self.ip,
                                chunk: self.chunk.clone(),
                                capturas: self.capturas.clone(),
                                este: self.este.clone(),
                            };
                            self.frames.push(frame);
                            self.chunk = (*chunk).clone();
                            self.ip = 0;
                            self.base_pila = self.pila.len() - arg_count;
                            self.capturas = capturas;
                        },
                        _ => return Err(format!("No se puede llamar a un valor que no es función/closure: {:?}", func)),
                    }
                },

                // ─── RETORNO ────────────────────────────────────────
                OpCode::Retorno => {
                    let res = self.pop()?;
                    if let Some(frame) = self.frames.pop() {
                        // Limpiar locales y argumentos de la pila, incluida la propia funcion (base_pila - 1)
                        if self.base_pila > 0 {
                            self.pila.truncate(self.base_pila - 1);
                        } else {
                            self.pila.clear();
                        }
                        self.push(res)?;
                        
                        // Restaurar caller
                        self.ip = frame.ip_retorno;
                        self.chunk = frame.chunk;
                        self.base_pila = frame.base_pila;
                        self.capturas = frame.capturas;
                        self.este = frame.este;
                    } else {
                        return Ok(Some(EstadoVM::Terminado(res)));
                    }
                },

                // ─── SUPERPOSICIÓN CUÁNTICA ────────────────────────
                OpCode::CrearQubit => {
                    let beta_val = self.pop()?;
                    let alpha_val = self.pop()?;
                    
                    let beta = match beta_val {
                        Valor::Decimal(b) => b,
                        Valor::Entero(b) => b as f64,
                        _ => return Err("El valor beta del Qubit no es numérico".into()),
                    };
                    
                    let alpha = match alpha_val {
                        Valor::Decimal(a) => a,
                        Valor::Entero(a) => a as f64,
                        _ => return Err("El valor alpha del Qubit no es numérico".into()),
                    };
                    
                    self.push(Valor::Superposicion { alpha, beta })?;
                },

                // ─── COLAPSO CUÁNTICO ──────────────────────────────
                OpCode::ColapsarQuantum => {
                    let val = self.pop()?;
                    match val {
                        Valor::Superposicion { alpha: _, beta } => {
                            // Colapso probabilístico: β² es la probabilidad de verdadero
                            let probabilidad = beta * beta;
                            
                            let mut buf = [0u8; 8];
                            if getrandom::fill(&mut buf).is_err() {
                                println!("GETRANDOM FALLO EN WINDOWS");
                                // Fallback a LCG si falla la entropía del OS
                                let seed = instruction_count.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                                buf = seed.to_le_bytes();
                            }
                            let rand_u64 = u64::from_le_bytes(buf);
                            // 53 bits de precisión para f64
                            let pseudo_random = ((rand_u64 >> 11) as f64) / ((1u64 << 53) as f64);
                            let resultado = pseudo_random < probabilidad;
                            self.push(Valor::Booleano(resultado))?;
                        },
                        // Si ya es un booleano, el colapso es idempotente
                        Valor::Booleano(b) => self.push(Valor::Booleano(b))?,
                        other => {
                            // Colapso de cualquier valor a booleano
                            self.push(Valor::Booleano(!Self::es_falso(&other)))?;
                        }
                    }
                },

                // ─── CONSTRUIR CLOSURE Y MOLDE ───────────────────────────
                OpCode::ConstruirClosure => {
                    let idx = self.leer_u16()? as usize;
                    let funcion_base = match self.leer_constante(idx)? {
                        Valor::Funcion { nombre, arity, chunk } => Valor::Funcion {
                            nombre: nombre.clone(),
                            arity: *arity,
                            chunk: chunk.clone(),
                        },
                        _ => return Err("El operando de ConstruirClosure no es una Función".into()),
                    };
                    
                    if let Valor::Funcion { arity, chunk, .. } = funcion_base {
                        // Leer la cantidad de capturas y consumir sus bytes del stream
                        let capture_count = self.leer_byte()? as usize;
                        let mut capturas_vals = Vec::with_capacity(capture_count);
                        for _ in 0..capture_count {
                            let es_local = self.leer_byte()? == 1;
                            let index = self.leer_byte()? as usize;
                            if es_local {
                                // Capturar valor local del frame actual
                                let idx = self.base_pila + index;
                                if idx < self.pila.len() {
                                    capturas_vals.push(self.pila[idx].clone());
                                } else {
                                    return Err(format!("Captura local fuera de rango: base={}, index={}, pila_len={}", self.base_pila, index, self.pila.len()));
                                }
                            } else {
                                // Capturar de las capturas del closure padre
                                if index < self.capturas.len() {
                                    capturas_vals.push(self.capturas[index].clone());
                                } else {
                                    return Err(format!("Captura transitiva fuera de rango: index={}, capturas_len={}", index, self.capturas.len()));
                                }
                            }
                        }

                        let closure = Valor::Closure {
                            arity,
                            chunk,
                            capturas: capturas_vals,
                        };
                        self.push(closure)?;
                    }
                },
                OpCode::ConstruirMolde => {
                    let idx = self.leer_u16()? as usize;
                    let nombre = match self.leer_constante(idx)? {
                        Valor::Texto(t) => t.clone(),
                        _ => return Err("Nombre de molde no es texto".into()),
                    };
                    
                    let instancia = Valor::Molde(std::rc::Rc::new(std::cell::RefCell::new(crate::valor::InstanciaMolde {
                        nombre,
                        campos: std::collections::HashMap::new(),
                        extra: std::collections::HashMap::new(),
                    })));
                    self.push(instancia)?;
                },

                // ─── CONSTRUIR LISTA ───────────────────────────────
                OpCode::ConstruirLista => {
                    let count = self.leer_u16()? as usize;
                    let mut items = Vec::with_capacity(count);
                    // Los elementos están en la pila en orden: primero el [0], último el [n-1]
                    for _ in 0..count {
                        items.push(self.pop()?);
                    }
                    items.reverse();
                    self.push(Valor::Lista(std::rc::Rc::new(std::cell::RefCell::new(items))))?;
                },

                // ─── COLECCIONES ──────────────────────────────────────────
                OpCode::ObtenerIndice => {
                    let indice = self.pop()?;
                    let coleccion = self.pop()?;
                    
                    match (&coleccion, &indice) {
                        (Valor::Lista(lista), Valor::Entero(idx)) => {
                            // MED-003 Fix: Guard against negative indices
                            if *idx < 0 {
                                return Err(format!("Índice de lista negativo no permitido: {}", idx));
                            }
                            let lista_ref = lista.borrow();
                            let i = *idx as usize;
                            if i < lista_ref.len() {
                                self.push(lista_ref[i].clone())?;
                            } else {
                                return Err(format!("Índice de lista fuera de rango: {} (longitud: {})", i, lista_ref.len()));
                            }
                        },
                        _ => return Err(format!("ObtenerIndice no soportado para {:?} y {:?}", coleccion, indice)),
                    }
                },
                OpCode::ObtenerLongitud => {
                    let coleccion = self.pop()?;
                    match &coleccion {
                        Valor::Lista(lista) => {
                            let l = lista.borrow().len();
                            let len = i64::try_from(l).map_err(|_| format!("Desbordamiento: lista demasiado grande ({})", l))?;
                            self.push(Valor::Entero(len))?;
                        },
                        Valor::Texto(t) => {
                            let l = t.len();
                            let len = i64::try_from(l).map_err(|_| format!("Desbordamiento: texto demasiado grande ({})", l))?;
                            self.push(Valor::Entero(len))?;
                        },
                        _ => return Err(format!("ObtenerLongitud no soportado para {:?}", coleccion)),
                    }
                },
                OpCode::AsignarIndice => {
                    let valor = self.pop()?;
                    let indice = self.pop()?;
                    let coleccion = self.pop()?;
                    
                    match (&coleccion, &indice) {
                        (Valor::Lista(lista), Valor::Entero(idx)) => {
                            // MED-003 Fix: Guard against negative indices
                            if *idx < 0 {
                                return Err(format!("Índice de lista negativo no permitido: {}", idx));
                            }
                            let mut lista_ref = lista.borrow_mut();
                            let i = *idx as usize;
                            if i < lista_ref.len() {
                                lista_ref[i] = valor.clone();
                                self.push(valor)?;
                            } else {
                                return Err(format!("Índice de lista fuera de rango: {} (longitud: {})", i, lista_ref.len()));
                            }
                        },
                        _ => return Err(format!("AsignarIndice no soportado para {:?} y {:?}", coleccion, indice)),
                    }
                },

                // ─── OBTENER CAMPO ─────────────────────────────────
                OpCode::ObtenerCampo => {
                    let idx = self.leer_u16()? as usize;
                    let campo = match self.leer_constante(idx)? {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de campo no es texto".into()),
                    };
                    let objeto = self.pop()?;
                    match objeto {
                        Valor::Molde(instancia_rc) => {
                            let instancia = instancia_rc.borrow();
                            if let Some(v) = instancia.campos.get(&campo) {
                                self.push(v.clone())?;
                            } else if let Some(v) = instancia.extra.get(&campo) {
                                self.push(v.clone())?;
                            } else {
                                return Err(format!("Campo '{}' no encontrado en el molde", campo));
                            }
                        },
                        _ => return Err(format!("No se puede acceder al campo '{}' de un valor que no es molde: {:?}", campo, objeto)),
                    }
                },

                // ─── ASIGNAR CAMPO ─────────────────────────────────
                OpCode::AsignarCampo => {
                    let idx = self.leer_u16()? as usize;
                    let campo = match self.leer_constante(idx)? {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de campo no es texto".into()),
                    };
                    let valor = self.pop()?;
                    let objeto = self.pop()?;
                    match &objeto {
                        Valor::Molde(instancia_rc) => {
                            let mut instancia = instancia_rc.borrow_mut();
                            if let std::collections::hash_map::Entry::Occupied(mut e) = instancia.campos.entry(campo.clone()) {
                                e.insert(valor);
                            } else {
                                // Espacio latente (elástico)
                                instancia.extra.insert(campo, valor);
                            }
                        },
                        _ => return Err(format!("No se puede asignar al campo '{}' de un valor que no es molde", campo)),
                    }
                    self.push(objeto)?;
                },

                // ─── LLAMAR BUILTIN ────────────────────────────────
                OpCode::LlamarBuiltin => {
                    let name_idx = self.leer_u16()? as usize;
                    let arg_count = self.leer_byte()? as usize;
                    let nombre = match self.leer_constante(name_idx)? {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de builtin no es texto".into()),
                    };
                    // Pop args in reverse order
                    let mut args = Vec::with_capacity(arg_count);
                    for _ in 0..arg_count {
                        args.push(self.pop()?);
                    }
                    args.reverse();

                    let resultado = match nombre.as_str() {
                        "shell" => {
                            if args.len() < 1 || args.len() > 2 { return Err("shell() requiere 1 o 2 argumentos".into()); }
                            let cmd = format!("{}", args[0]);
                            let confianza = if args.len() == 2 {
                                match args[1] {
                                    Valor::Decimal(d) => Some(d),
                                    Valor::Entero(i) => Some(i as f64),
                                    _ => return Err("El nivel de confianza debe ser numérico".into()),
                                }
                            } else {
                                None
                            };
                            match crate::stdlib::shell(&cmd, confianza, &self.vigilante) {
                                Ok(out) => Valor::Texto(out),
                                Err(e) => return Err(e),
                            }
                        },
                        "leer" => {
                            if args.len() != 1 { return Err("leer() requiere 1 argumento".into()); }
                            let ruta = format!("{}", args[0]);
                            match crate::stdlib::leer(&ruta, &self.vigilante) {
                                Ok(content) => Valor::Texto(content),
                                Err(e) => return Err(e),
                            }
                        },
                        "escribir" => {
                            if args.len() != 2 { return Err("escribir() requiere 2 argumentos (ruta, contenido)".into()); }
                            let ruta = format!("{}", args[0]);
                            let contenido = format!("{}", args[1]);
                            match crate::stdlib::escribir(&ruta, &contenido, &self.vigilante) {
                                Ok(_) => Valor::Nulo,
                                Err(e) => return Err(e),
                            }
                        },
                        "entorno" => {
                            if args.len() != 1 { return Err("entorno() requiere 1 argumento".into()); }
                            let nombre = format!("{}", args[0]);
                            match crate::stdlib::entorno(&nombre, &self.vigilante) {
                                Ok(val) => Valor::Texto(val),
                                Err(e) => return Err(e),
                            }
                        },
                        "existe" => {
                            if args.len() != 1 { return Err("existe() requiere 1 argumento".into()); }
                            let ruta = format!("{}", args[0]);
                            Valor::Booleano(crate::stdlib::existe(&ruta, &self.vigilante))
                        },
                        "peticion_get" => {
                            if args.len() != 1 { return Err("peticion_get() requiere 1 argumento".into()); }
                            let url = format!("{}", args[0]);
                            match crate::stdlib::peticion_get(&url, &self.vigilante) {
                                Ok(body) => Valor::Texto(body),
                                Err(e) => return Err(e),
                            }
                        },
                        _ => return Err(format!("Función builtin desconocida: '{}'", nombre)),
                    };
                    self.push(resultado)?;
                },
                OpCode::ConfigurarCatch => {
                    let offset = self.leer_u16()? as usize;
                    let target_ip = self.ip + offset;
                    self.handlers_catch.push((target_ip, self.pila.len(), self.frames.len()));
                },
                OpCode::LimpiarCatch => {
                    self.handlers_catch.pop();
                },
                OpCode::LanzarError => {
                    let err_val = self.pop()?;
                    return Err(format!("{}", err_val));
                },
                OpCode::Esperar => {
                    let promesa = self.pop()?;
                    return Ok(Some(EstadoVM::Suspendido(promesa)));
                },
                OpCode::InvocacionMetodo => {
                    let name_idx = self.leer_u16()? as usize;
                    let arg_count = self.leer_byte()? as usize;
                    let nombre_metodo = match self.leer_constante(name_idx)? {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de método no es texto".into()),
                    };

                    if self.pila.len() < 1 + arg_count {
                        return Err(format!("Pila insuficiente para InvocacionMetodo: necesita {}, tiene {}", 1 + arg_count, self.pila.len()));
                    }
                    let offset_obj = self.pila.len() - 1 - arg_count;
                    let obj = self.pila[offset_obj].clone();

                    let closure = match &obj {
                        Valor::Molde(rc_inst) => {
                            let inst = rc_inst.borrow();
                            if let Some(val) = inst.campos.get(&nombre_metodo) {
                                val.clone()
                            } else if let Some(val) = inst.extra.get(&nombre_metodo) {
                                val.clone()
                            } else {
                                return Err(format!("Método '{}' no encontrado en el objeto", nombre_metodo));
                            }
                        },
                        _ => return Err(format!("Invocación de método sobre un valor que no es un objeto Molde: {:?}", obj)),
                    };

                    match closure {
                        Valor::Closure { arity, chunk, capturas } => {
                            if arity != arg_count {
                                return Err(format!("Método '{}' esperaba {} argumentos, recibió {}", nombre_metodo, arity, arg_count));
                            }
                            if self.frames.len() >= MAX_FRAMES {
                                return Err("Stack Overflow".into());
                            }
                            let frame = CallFrame {
                                base_pila: self.base_pila,
                                ip_retorno: self.ip,
                                chunk: self.chunk.clone(),
                                capturas: self.capturas.clone(),
                                este: self.este.clone(),
                            };
                            self.frames.push(frame);
                            self.chunk = (*chunk).clone();
                            self.ip = 0;
                            self.base_pila = self.pila.len() - arg_count;
                            self.capturas = capturas;
                            self.este = Some(obj);
                        },
                        Valor::Funcion { arity, chunk, .. } => {
                            if arity != arg_count {
                                return Err(format!("Método '{}' esperaba {} argumentos, recibió {}", nombre_metodo, arity, arg_count));
                            }
                            if self.frames.len() >= MAX_FRAMES {
                                return Err("Stack Overflow".into());
                            }
                            let frame = CallFrame {
                                base_pila: self.base_pila,
                                ip_retorno: self.ip,
                                chunk: self.chunk.clone(),
                                capturas: self.capturas.clone(),
                                este: self.este.clone(),
                            };
                            self.frames.push(frame);
                            self.chunk = (*chunk).clone();
                            self.ip = 0;
                            self.base_pila = self.pila.len() - arg_count;
                            self.capturas = Vec::new();
                            self.este = Some(obj);
                        },
                        _ => return Err(format!("Propiedad '{}' no es invocable como método", nombre_metodo)),
                    }
                },
                OpCode::ObtenerEste => {
                    if let Some(ref e) = self.este {
                        self.push(e.clone())?;
                    } else {
                        return Err("No se puede usar 'este' fuera de un método de molde".into());
                    }
                },
                OpCode::EntrarPensar => {
                    // Shadow environment marker (para aislamiento de scopes a futuro)
                },
                OpCode::SalirPensar => {
                    // Shadow environment marker (para aislamiento de scopes a futuro)
                },
                OpCode::ObtenerCaptura => {
                    let idx = self.leer_byte()? as usize;
                    if idx < self.capturas.len() {
                        let val = self.capturas[idx].clone();
                        self.push(val)?;
                    } else {
                        return Err(format!("Captura fuera de rango: {} (disponibles: {})", idx, self.capturas.len()));
                    }
                },
                _ => return Err(format!("OpCode desconocido en la VM: {:?}", op)),
            }
            Ok(None)
        })();

        match resultado_paso {
            Ok(Some(valor)) => return Ok(valor),
            Ok(None) => {}, // continuar ciclo
            Err(e) => {
                // Módulo de Intercepción de Errores (Catch)
                // CRIT-001 Fix: Clone frame data BEFORE truncating to prevent
                // use-after-borrow and ensure safe unwinding of nested catches.
                if let Some((ip_handler, len_pila, len_frames)) = self.handlers_catch.pop() {
                    // Si el error ocurrió dentro de una llamada a función que el catch envuelve
                    if len_frames < self.frames.len() {
                        // Clone all needed values first, then truncate
                        let restored_chunk = self.frames[len_frames].chunk.clone();
                        let restored_base = self.frames[len_frames].base_pila;
                        let restored_capturas = self.frames[len_frames].capturas.clone();
                        self.frames.truncate(len_frames);
                        self.chunk = restored_chunk;
                        self.base_pila = restored_base;
                        self.capturas = restored_capturas;
                    }
                    
                    self.ip = ip_handler;
                    self.pila.truncate(len_pila);
                    self.push(Valor::Texto(e))?;
                } else {
                    return Err(e);
                }
            }
        }
    }
}

    #[inline(always)]
    fn leer_byte(&mut self) -> Result<u8, String> {
        if self.ip >= self.chunk.codigo.len() {
            return Err("Bytecode truncado: se esperaba un byte adicional pero el flujo terminó".to_string());
        }
        let byte = self.chunk.codigo[self.ip];
        self.ip += 1;
        Ok(byte)
    }

    #[inline(always)]
    fn leer_u16(&mut self) -> Result<u16, String> {
        let lo = self.leer_byte()? as u16;
        let hi = self.leer_byte()? as u16;
        Ok((hi << 8) | lo)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{Nodo, OpBinario, Programa};
    use crate::compiler::Compilador;

    #[test]
    fn test_aritmética_completa_con_compilador() {
        let n_1 = Box::new(Nodo::EnteroLit(1));
        let n_2 = Box::new(Nodo::EnteroLit(2));
        let n_3 = Box::new(Nodo::EnteroLit(3));

        let mul = Box::new(Nodo::Binario {
            izq: n_2,
            op: OpBinario::Multiplicar,
            der: n_3,
        });

        let eq = Nodo::Binario {
            izq: n_1,
            op: OpBinario::Sumar,
            der: mul,
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar(&eq).is_ok());
        println!("CODIGO: {:?}", compilador.chunk.codigo);
        println!("CONSTANTES: {:?}", compilador.chunk.constantes);
        let mut vm = VM::nueva(compilador.chunk);
        let resultado = vm.ejecutar();
        println!("RESULTADO: {:?}", resultado);
        assert!(resultado.is_ok());
        if let Ok(EstadoVM::Terminado(Valor::Entero(res))) = resultado {
            assert_eq!(res, 7);
        } else {
            panic!("El resultado no fue un Entero con valor 7: {:?}", resultado);
        }
    }

    #[test]
    fn test_variable_global_y_mostrar() {
        let programa = Programa {
            sentencias: vec![
                Nodo::Asignacion {
                    nombre: "saludo".to_string(),
                    valor: Box::new(Nodo::TextoLit("Hola Moset!".to_string())),
                },
                Nodo::Mostrar(Box::new(Nodo::Identificador("saludo".to_string()))),
            ],
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());

        let mut output = Vec::new();
        let mut vm = VM::nueva(compilador.chunk);
        vm.on_print = Some(Box::new(move |s| output.push(s.to_string())));
        let res = vm.ejecutar();
        assert!(res.is_ok());
    }

    #[test]
    fn test_condicional_si_sino() {
        let programa = Programa {
            sentencias: vec![
                Nodo::Condicional {
                    condicion: Box::new(Nodo::Binario {
                        izq: Box::new(Nodo::EnteroLit(10)),
                        op: OpBinario::Mayor,
                        der: Box::new(Nodo::EnteroLit(5)),
                    }),
                    cuerpo_si: vec![
                        Nodo::Mostrar(Box::new(Nodo::TextoLit("correcto".to_string()))),
                    ],
                    cuerpo_sino: Some(vec![
                        Nodo::Mostrar(Box::new(Nodo::TextoLit("incorrecto".to_string()))),
                    ]),
                },
            ],
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());
        let mut vm = VM::nueva(compilador.chunk);
        assert!(vm.ejecutar().is_ok());
    }

    #[test]
    fn test_comparaciones_extendidas() {
        // Test >=
        let programa = Programa {
            sentencias: vec![
                Nodo::Mostrar(Box::new(Nodo::Binario {
                    izq: Box::new(Nodo::EnteroLit(5)),
                    op: OpBinario::MayorIgual,
                    der: Box::new(Nodo::EnteroLit(5)),
                })),
            ],
        };
        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());
        let mut vm = VM::nueva(compilador.chunk);
        assert!(vm.ejecutar().is_ok());
    }

    #[test]
    fn test_texto_concatenacion() {
        let programa = Programa {
            sentencias: vec![
                Nodo::Mostrar(Box::new(Nodo::Binario {
                    izq: Box::new(Nodo::TextoLit("Hola ".to_string())),
                    op: OpBinario::Sumar,
                    der: Box::new(Nodo::TextoLit("Mundo".to_string())),
                })),
            ],
        };
        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());
        let mut vm = VM::nueva(compilador.chunk);
        assert!(vm.ejecutar().is_ok());
    }

    #[test]
    fn test_colapsar_quantum() {
        let programa = Programa {
            sentencias: vec![
                Nodo::Asignacion {
                    nombre: "q".to_string(),
                    valor: Box::new(Nodo::SuperposicionLit { alpha: 0.0, beta: 1.0 }), // 100% true
                },
                Nodo::Asignacion {
                    nombre: "res".to_string(),
                    valor: Box::new(Nodo::Colapsar(Box::new(Nodo::Identificador("q".to_string())))),
                },
                Nodo::Mostrar(Box::new(Nodo::Identificador("res".to_string()))),
            ],
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());

        let mut output = Vec::new();
        let mut vm = VM::nueva(compilador.chunk);
        vm.on_print = Some(Box::new(move |s| output.push(s.to_string())));
        let res = vm.ejecutar();
        
        assert!(res.is_ok());
    }

    #[test]
    fn test_invocacion_metodo_y_este() {
        // Simular:
        // c = Contador { valor: 10 }
        // c.inc = closure() { este.valor = este.valor + 1 }
        // c.inc()
        // c.valor
        
        let programa = Programa {
            sentencias: vec![
                // 1. Definir Molde
                Nodo::MoldeDefinicion {
                    nombre: "Contador".to_string(),
                    campos: vec!["valor".to_string()],
                    elastico: true,
                },
                // 2. Instanciar
                Nodo::Asignacion {
                    nombre: "c".to_string(),
                    valor: Box::new(Nodo::MoldeInstancia {
                        nombre: "Contador".to_string(),
                        valores: vec![("valor".to_string(), Nodo::EnteroLit(10))],
                    }),
                },
                // 3. Asignar método (closure que usa 'este')
                Nodo::AsignacionCampo {
                    objeto: Box::new(Nodo::Identificador("c".to_string())),
                    campo: "inc".to_string(),
                    valor: Box::new(Nodo::Closure {
                        params: vec![],
                        cuerpo: vec![
                            Nodo::AsignacionCampo {
                                objeto: Box::new(Nodo::Este),
                                campo: "valor".to_string(),
                                valor: Box::new(Nodo::Binario {
                                    izq: Box::new(Nodo::AccesoCampo {
                                        objeto: Box::new(Nodo::Este),
                                        campo: "valor".to_string(),
                                    }),
                                    op: OpBinario::Sumar,
                                    der: Box::new(Nodo::EnteroLit(1)),
                                }),
                            },
                        ],
                    }),
                },
                // 4. Llamar al método
                Nodo::LlamadaMetodo {
                    objeto: Box::new(Nodo::Identificador("c".to_string())),
                    metodo: "inc".to_string(),
                    args: vec![],
                },
                // 5. Dejar el valor final en la pila para verificar
                Nodo::Retornar(Box::new(Nodo::AccesoCampo {
                    objeto: Box::new(Nodo::Identificador("c".to_string())),
                    campo: "valor".to_string(),
                }))
            ],
        };

        let mut compilador = Compilador::nuevo();
        assert!(compilador.compilar_programa(&programa).is_ok());

        let mut vm = VM::nueva(compilador.chunk);
        let res = vm.ejecutar();
        
        println!("RESULTADO FINAL: {:?}", res);
        assert!(res.is_ok());
        
        if let Ok(EstadoVM::Terminado(Valor::Entero(v))) = res {
            assert_eq!(v, 11);
        } else {
            panic!("Se esperaba un Entero(11), se obtuvo: {:?}", res);
        }
    }
}
