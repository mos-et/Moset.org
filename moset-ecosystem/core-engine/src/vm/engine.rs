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
}

pub type PrintCallback = Box<dyn FnMut(&str) + Send + Sync>;

pub struct VM {
    chunk: Chunk,
    ip: usize,
    pila: Vec<Valor>,
    globales: HashMap<String, Valor>,
    frames: Vec<CallFrame>,
    pub on_print: Option<PrintCallback>,
    pub vigilante: std::rc::Rc<crate::vigilante::Vigilante>,
    pub capturas: Vec<Valor>,
    base_pila: usize,
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
            base_pila: 0,
        }
    }

    #[inline(always)]
    fn push(&mut self, valor: Valor) {
        self.pila.push(valor);
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

    /// Evalúa si un valor es "falsy" en la semántica Moset
    fn es_falso(valor: &Valor) -> bool {
        match valor {
            Valor::Nulo => true,
            Valor::Booleano(b) => !b,
            Valor::Entero(0) => true,
            _ => false,
        }
    }

    pub fn ejecutar(&mut self) -> Result<Valor, String> {
        let mut instruction_count: u64 = 0;
        const MAX_INSTRUCTIONS: u64 = 5_000_000;
        loop {
            instruction_count += 1;
            if instruction_count > MAX_INSTRUCTIONS {
                return Err("ERR_LIMIT: Límite de ejecución excedido (Seguridad contra bucles infinitos - BUG-022)".to_string());
            }
            if self.ip >= self.chunk.codigo.len() {
                return Ok(Valor::Nulo); // Fin seguro
            }
            let instruccion = self.leer_byte();
            let op: OpCode = instruccion.into();

            match op {
                // ─── CONSTANTES ─────────────────────────────────────
                OpCode::Constante => {
                    let indice = self.leer_u16() as usize;
                    if indice >= self.chunk.constantes.len() {
                        return Err(format!("Índice de constante fuera de rango: {}", indice));
                    }
                    let constante = self.chunk.constantes[indice].clone();
                    self.push(constante);
                },

                // ─── ARITMÉTICA ─────────────────────────────────────
                OpCode::Suma => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (&a, &b) {
                        (Valor::Entero(x), Valor::Entero(y)) => Valor::Entero(x + y),
                        (Valor::Decimal(x), Valor::Decimal(y)) => Valor::Decimal(x + y),
                        (Valor::Entero(x), Valor::Decimal(y)) => Valor::Decimal(*x as f64 + y),
                        (Valor::Decimal(x), Valor::Entero(y)) => Valor::Decimal(x + *y as f64),
                        // Concatenación de texto automática
                        (Valor::Texto(s1), Valor::Texto(s2)) => Valor::Texto(format!("{}{}", s1, s2)),
                        (Valor::Texto(s), _) => Valor::Texto(format!("{}{}", s, b)),
                        (_, Valor::Texto(s)) => Valor::Texto(format!("{}{}", a, s)),
                        _ => return Err(format!("No se puede sumar {:?} + {:?}", a, b)),
                    };
                    self.push(res);
                },
                OpCode::Resta => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => Valor::Entero(x - y),
                        (Valor::Decimal(x), Valor::Decimal(y)) => Valor::Decimal(x - y),
                        (Valor::Entero(x), Valor::Decimal(y)) => Valor::Decimal(x as f64 - y),
                        (Valor::Decimal(x), Valor::Entero(y)) => Valor::Decimal(x - y as f64),
                        _ => return Err("Operadores inválidos para resta".into()),
                    };
                    self.push(res);
                },
                OpCode::Multiplicacion => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => Valor::Entero(x * y),
                        (Valor::Decimal(x), Valor::Decimal(y)) => Valor::Decimal(x * y),
                        (Valor::Entero(x), Valor::Decimal(y)) => Valor::Decimal(x as f64 * y),
                        (Valor::Decimal(x), Valor::Entero(y)) => Valor::Decimal(x * y as f64),
                        _ => return Err("Operadores inválidos para multiplicación".into()),
                    };
                    self.push(res);
                },
                OpCode::Division => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => {
                            if y == 0 { return Err("División por cero".into()); }
                            Valor::Entero(x / y)
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
                    self.push(res);
                },
                OpCode::Modulo => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    let res = match (a, b) {
                        (Valor::Entero(x), Valor::Entero(y)) => {
                            if y == 0 { return Err("Módulo por cero".into()); }
                            Valor::Entero(x % y)
                        },
                        _ => return Err("Módulo solo soporta enteros".into()),
                    };
                    self.push(res);
                },

                // ─── NEGACIÓN ───────────────────────────────────────
                OpCode::Negacion => {
                    let val = self.pop()?;
                    let res = match val {
                        Valor::Entero(n) => Valor::Entero(-n),
                        Valor::Decimal(n) => Valor::Decimal(-n),
                        _ => return Err("No se puede negar este valor".into()),
                    };
                    self.push(res);
                },

                // ─── BOOLEANOS / NULO ───────────────────────────────
                OpCode::Verdadero => self.push(Valor::Booleano(true)),
                OpCode::Falso => self.push(Valor::Booleano(false)),
                OpCode::Nulo => self.push(Valor::Nulo),

                // ─── LÓGICA ─────────────────────────────────────────
                OpCode::No => {
                    let val = self.pop()?;
                    self.push(Valor::Booleano(Self::es_falso(&val)));
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
                    self.push(Valor::Booleano(res));
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
                    self.push(Valor::Booleano(res));
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
                    self.push(Valor::Booleano(res));
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
                    self.push(Valor::Booleano(res));
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
                    self.push(Valor::Booleano(res));
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
                    self.push(Valor::Booleano(res));
                },

                // ─── CONCATENAR TEXTO ───────────────────────────────
                OpCode::Concatenar => {
                    let b = self.pop()?;
                    let a = self.pop()?;
                    self.push(Valor::Texto(format!("{}{}", a, b)));
                },

                // ─── IMPRIMIR ───────────────────────────────────────
                OpCode::Imprimir => {
                    let val = self.pop()?;
                    if let Some(cb) = &mut self.on_print {
                        cb(&format!("{}", val));
                    } else {
                        println!("{}", val);
                    }
                    self.push(Valor::Nulo);
                },

                // ─── PILA ───────────────────────────────────────────
                OpCode::Pop => {
                    self.pop()?;
                },

                // ─── VARIABLES GLOBALES ─────────────────────────────
                OpCode::DefinirGlobal => {
                    let idx = self.leer_u16() as usize;
                    let nombre = match &self.chunk.constantes[idx] {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de variable global no es texto".into()),
                    };
                    let valor = self.pop()?;
                    self.globales.insert(nombre, valor);
                },
                OpCode::ObtenerGlobal => {
                    let idx = self.leer_u16() as usize;
                    let nombre = match &self.chunk.constantes[idx] {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de variable global no es texto".into()),
                    };
                    match self.globales.get(&nombre) {
                        Some(val) => self.push(val.clone()),
                        None => return Err(format!("Variable global no definida: '{}'", nombre)),
                    }
                },
                OpCode::AsignarGlobal => {
                    let idx = self.leer_u16() as usize;
                    let nombre = match &self.chunk.constantes[idx] {
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
                    let slot = self.leer_byte() as usize;
                    let idx = self.base_pila + slot;
                    if idx >= self.pila.len() {
                        return Err(format!("Slot local fuera de rango: {}", idx));
                    }
                    let valor = self.pila[idx].clone();
                    self.push(valor);
                },
                OpCode::AsignarLocal => {
                    let slot = self.leer_byte() as usize;
                    let idx = self.base_pila + slot;
                    let valor = self.peek(0)?.clone();
                    if idx >= self.pila.len() {
                        return Err(format!("Slot local fuera de rango: {}", idx));
                    }
                    self.pila[idx] = valor;
                },

                // ─── SALTOS ─────────────────────────────────────────
                OpCode::Salto => {
                    let offset = self.leer_u16() as usize;
                    self.ip += offset;
                },
                OpCode::SaltoSiFalso => {
                    let offset = self.leer_u16() as usize;
                    let condicion = self.peek(0)?;
                    if Self::es_falso(condicion) {
                        self.ip += offset;
                    }
                },
                OpCode::Bucle => {
                    let offset = self.leer_u16() as usize;
                    self.ip -= offset;
                },

                // ─── LLAMADAS A FUNCIÓN ─────────────────────────────
                OpCode::Llamar => {
                    let arg_count = self.leer_byte() as usize;
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
                    let res = self.pop().unwrap_or(Valor::Nulo);
                    if let Some(frame) = self.frames.pop() {
                        // Limpiar locales y argumentos de la pila, incluida la propia funcion (base_pila - 1)
                        if self.base_pila > 0 {
                            self.pila.truncate(self.base_pila - 1);
                        } else {
                            self.pila.clear();
                        }
                        self.push(res);
                        
                        // Restaurar caller
                        self.ip = frame.ip_retorno;
                        self.chunk = frame.chunk;
                        self.base_pila = frame.base_pila;
                        self.capturas = frame.capturas;
                    } else {
                        return Ok(res);
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
                    
                    self.push(Valor::Superposicion { alpha, beta });
                },

                // ─── COLAPSO CUÁNTICO ──────────────────────────────
                OpCode::ColapsarQuantum => {
                    let val = self.pop()?;
                    match val {
                        Valor::Superposicion { alpha: _, beta } => {
                            // Colapso probabilístico: β² es la probabilidad de verdadero
                            let probabilidad = beta * beta;
                            // Usar un hash simple del instruction_count como semilla pseudo-random
                            let pseudo_random = {
                                let seed = instruction_count.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                                ((seed >> 33) as f64) / (u32::MAX as f64)
                            };
                            let resultado = pseudo_random < probabilidad;
                            self.push(Valor::Booleano(resultado));
                        },
                        // Si ya es un booleano, el colapso es idempotente
                        Valor::Booleano(b) => self.push(Valor::Booleano(b)),
                        other => {
                            // Colapso de cualquier valor a booleano
                            self.push(Valor::Booleano(!Self::es_falso(&other)));
                        }
                    }
                },

                // ─── CONSTRUIR CLOSURE Y MOLDE ───────────────────────────
                OpCode::ConstruirClosure => {
                    let idx = self.leer_u16() as usize;
                    let funcion_base = match &self.chunk.constantes[idx] {
                        Valor::Funcion { nombre, arity, chunk } => Valor::Funcion {
                            nombre: nombre.clone(),
                            arity: *arity,
                            chunk: chunk.clone(),
                        },
                        _ => return Err("El operando de ConstruirClosure no es una Función".into()),
                    };
                    
                    if let Valor::Funcion { arity, chunk, .. } = funcion_base {
                        let closure = Valor::Closure {
                            arity,
                            chunk,
                            capturas: Vec::new(), // TODO: Capturar entorno
                        };
                        self.push(closure);
                    }
                },
                OpCode::ConstruirMolde => {
                    let idx = self.leer_u16() as usize;
                    let nombre = match &self.chunk.constantes[idx] {
                        Valor::Texto(t) => t.clone(),
                        _ => return Err("Nombre de molde no es texto".into()),
                    };
                    
                    let instancia = Valor::Molde(std::rc::Rc::new(std::cell::RefCell::new(crate::valor::InstanciaMolde {
                        nombre,
                        campos: std::collections::HashMap::new(),
                        extra: std::collections::HashMap::new(),
                    })));
                    self.push(instancia);
                },

                // ─── CONSTRUIR LISTA ───────────────────────────────
                OpCode::ConstruirLista => {
                    let count = self.leer_u16() as usize;
                    let mut items = Vec::with_capacity(count);
                    // Los elementos están en la pila en orden: primero el [0], último el [n-1]
                    for _ in 0..count {
                        items.push(self.pop()?);
                    }
                    items.reverse();
                    self.push(Valor::Lista(std::rc::Rc::new(std::cell::RefCell::new(items))));
                },

                // ─── COLECCIONES ──────────────────────────────────────────
                OpCode::ObtenerIndice => {
                    let indice = self.pop()?;
                    let coleccion = self.pop()?;
                    
                    match (&coleccion, &indice) {
                        (Valor::Lista(lista), Valor::Entero(idx)) => {
                            let lista_ref = lista.borrow();
                            let i = *idx as usize;
                            if i < lista_ref.len() {
                                self.push(lista_ref[i].clone());
                            } else {
                                return Err(format!("Índice de lista fuera de rango: {}", i));
                            }
                        },
                        _ => return Err(format!("ObtenerIndice no soportado para {:?} y {:?}", coleccion, indice)),
                    }
                },
                OpCode::ObtenerLongitud => {
                    let coleccion = self.pop()?;
                    match &coleccion {
                        Valor::Lista(lista) => {
                            let len = lista.borrow().len() as i64;
                            self.push(Valor::Entero(len));
                        },
                        Valor::Texto(t) => {
                            let len = t.len() as i64;
                            self.push(Valor::Entero(len));
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
                            let mut lista_ref = lista.borrow_mut();
                            let i = *idx as usize;
                            if i < lista_ref.len() {
                                lista_ref[i] = valor.clone();
                                self.push(valor);
                            } else {
                                return Err(format!("Índice de lista fuera de rango: {}", i));
                            }
                        },
                        _ => return Err(format!("AsignarIndice no soportado para {:?} y {:?}", coleccion, indice)),
                    }
                },

                // ─── OBTENER CAMPO ─────────────────────────────────
                OpCode::ObtenerCampo => {
                    let idx = self.leer_u16() as usize;
                    let campo = match &self.chunk.constantes[idx] {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de campo no es texto".into()),
                    };
                    let objeto = self.pop()?;
                    match objeto {
                        Valor::Molde(instancia_rc) => {
                            let instancia = instancia_rc.borrow();
                            if let Some(v) = instancia.campos.get(&campo) {
                                self.push(v.clone());
                            } else if let Some(v) = instancia.extra.get(&campo) {
                                self.push(v.clone());
                            } else {
                                return Err(format!("Campo '{}' no encontrado en el molde", campo));
                            }
                        },
                        _ => return Err(format!("No se puede acceder al campo '{}' de un valor que no es molde: {:?}", campo, objeto)),
                    }
                },

                // ─── ASIGNAR CAMPO ─────────────────────────────────
                OpCode::AsignarCampo => {
                    let idx = self.leer_u16() as usize;
                    let campo = match &self.chunk.constantes[idx] {
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
                    self.push(objeto);
                },

                // ─── LLAMAR BUILTIN ────────────────────────────────
                OpCode::LlamarBuiltin => {
                    let name_idx = self.leer_u16() as usize;
                    let arg_count = self.leer_byte() as usize;
                    let nombre = match &self.chunk.constantes[name_idx] {
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
                            if args.len() != 1 { return Err("shell() requiere 1 argumento".into()); }
                            let cmd = format!("{}", args[0]);
                            match crate::stdlib::shell(&cmd, &self.vigilante) {
                                Ok(out) => Valor::Texto(out),
                                Err(e) => return Err(e),
                            }
                        },
                        "leer" => {
                            if args.len() != 1 { return Err("leer() requiere 1 argumento".into()); }
                            let ruta = format!("{}", args[0]);
                            match crate::stdlib::leer(&ruta) {
                                Ok(content) => Valor::Texto(content),
                                Err(e) => return Err(e),
                            }
                        },
                        "escribir" => {
                            if args.len() != 2 { return Err("escribir() requiere 2 argumentos (ruta, contenido)".into()); }
                            let ruta = format!("{}", args[0]);
                            let contenido = format!("{}", args[1]);
                            match crate::stdlib::escribir(&ruta, &contenido) {
                                Ok(_) => Valor::Nulo,
                                Err(e) => return Err(e),
                            }
                        },
                        "entorno" => {
                            if args.len() != 1 { return Err("entorno() requiere 1 argumento".into()); }
                            let nombre = format!("{}", args[0]);
                            match crate::stdlib::entorno(&nombre) {
                                Ok(val) => Valor::Texto(val),
                                Err(e) => return Err(e),
                            }
                        },
                        "existe" => {
                            if args.len() != 1 { return Err("existe() requiere 1 argumento".into()); }
                            let ruta = format!("{}", args[0]);
                            Valor::Booleano(crate::stdlib::existe(&ruta))
                        },
                        "peticion_get" => {
                            if args.len() != 1 { return Err("peticion_get() requiere 1 argumento".into()); }
                            let url = format!("{}", args[0]);
                            match crate::stdlib::peticion_get(&url) {
                                Ok(body) => Valor::Texto(body),
                                Err(e) => return Err(e),
                            }
                        },
                        _ => return Err(format!("Función builtin desconocida: '{}'", nombre)),
                    };
                    self.push(resultado);
                },
                _ => return Err(format!("OpCode no implementado en la VM: {:?}", op)),
            }
        }
    }

    #[inline(always)]
    fn leer_byte(&mut self) -> u8 {
        let byte = self.chunk.codigo[self.ip];
        self.ip += 1;
        byte
    }

    #[inline(always)]
    fn leer_u16(&mut self) -> u16 {
        let lo = self.leer_byte() as u16;
        let hi = self.leer_byte() as u16;
        (hi << 8) | lo
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
        if let Ok(Valor::Entero(res)) = resultado {
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
}
