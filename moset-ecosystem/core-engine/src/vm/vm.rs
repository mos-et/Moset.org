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
    /// Chunk de la función siendo ejecutada
    chunk: Chunk,
}

pub struct VM {
    chunk: Chunk,
    ip: usize,
    pila: Vec<Valor>,
    globales: HashMap<String, Valor>,
    frames: Vec<CallFrame>,
    pub on_print: Option<Box<dyn FnMut(&str) + Send + Sync>>,
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
                    let indice = self.leer_byte() as usize;
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
                    let idx = self.leer_byte() as usize;
                    let nombre = match &self.chunk.constantes[idx] {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de variable global no es texto".into()),
                    };
                    let valor = self.pop()?;
                    self.globales.insert(nombre, valor);
                },
                OpCode::ObtenerGlobal => {
                    let idx = self.leer_byte() as usize;
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
                    let idx = self.leer_byte() as usize;
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
                    if slot >= self.pila.len() {
                        return Err(format!("Slot local fuera de rango: {}", slot));
                    }
                    let valor = self.pila[slot].clone();
                    self.push(valor);
                },
                OpCode::AsignarLocal => {
                    let slot = self.leer_byte() as usize;
                    let valor = self.peek(0)?.clone();
                    if slot >= self.pila.len() {
                        return Err(format!("Slot local fuera de rango: {}", slot));
                    }
                    self.pila[slot] = valor;
                },

                // ─── SALTOS ─────────────────────────────────────────
                OpCode::Salto => {
                    let hi = self.leer_byte() as usize;
                    let lo = self.leer_byte() as usize;
                    let offset = (hi << 8) | lo;
                    self.ip += offset;
                },
                OpCode::SaltoSiFalso => {
                    let hi = self.leer_byte() as usize;
                    let lo = self.leer_byte() as usize;
                    let offset = (hi << 8) | lo;
                    let condicion = self.peek(0)?;
                    if Self::es_falso(condicion) {
                        self.ip += offset;
                    }
                },
                OpCode::Bucle => {
                    let hi = self.leer_byte() as usize;
                    let lo = self.leer_byte() as usize;
                    let offset = (hi << 8) | lo;
                    self.ip -= offset;
                },

                // ─── LLAMADAS A FUNCIÓN ─────────────────────────────
                OpCode::Llamar => {
                    let arg_count = self.leer_byte() as usize;
                    let func_slot = self.pila.len() - 1 - arg_count;
                    let func = self.pila[func_slot].clone();

                    match func {
                        Valor::Funcion { params, cuerpo, .. } => {
                            if params.len() != arg_count {
                                return Err(format!(
                                    "Función esperaba {} argumentos, recibió {}",
                                    params.len(), arg_count
                                ));
                            }

                            // Compilar la función en un chunk separado
                            let mut sub_compilador = crate::compiler::Compilador::nuevo();
                            // Definimos los parámetros como locales
                            for (i, _param) in params.iter().enumerate() {
                                // El argumento ya está en la pila
                                let valor = self.pila[func_slot + 1 + i].clone();
                                sub_compilador.chunk.añadir_constante(valor.clone());
                            }
                            
                            // Compilar el cuerpo de la función
                            let programa_func = crate::ast::Programa { sentencias: cuerpo };
                            sub_compilador.compilar_programa(&programa_func)
                                .map_err(|e| format!("Error compilando función: {}", e))?;

                            // Ejecutar en una sub-VM
                            let mut sub_vm = VM::nueva(sub_compilador.chunk);
                            // Pasar los argumentos como globales (simplificación)
                            for (i, param) in params.iter().enumerate() {
                                let valor = self.pila[func_slot + 1 + i].clone();
                                sub_vm.globales.insert(param.clone(), valor);
                            }
                            // Heredar globales del padre
                            for (k, v) in &self.globales {
                                if !sub_vm.globales.contains_key(k) {
                                    sub_vm.globales.insert(k.clone(), v.clone());
                                }
                            }
                            // Heredar on_print (si hay)
                            // No podemos mover on_print, así que la sub-VM imprime directo
                            
                            let resultado = sub_vm.ejecutar()?;

                            // Limpiar: pop función + argumentos, push resultado
                            for _ in 0..=arg_count {
                                self.pop()?;
                            }
                            self.push(resultado);
                        },
                        _ => return Err(format!("No se puede llamar a un valor que no es función: {:?}", func)),
                    }
                },

                // ─── RETORNO ────────────────────────────────────────
                OpCode::Retorno => {
                    if let Ok(res) = self.pop() {
                        return Ok(res);
                    } else {
                        return Ok(Valor::Nulo);
                    }
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

                // ─── CONSTRUIR LISTA ───────────────────────────────
                OpCode::ConstruirLista => {
                    let count = self.leer_byte() as usize;
                    let mut items = Vec::with_capacity(count);
                    // Los elementos están en la pila en orden: primero el [0], último el [n-1]
                    for _ in 0..count {
                        items.push(self.pop()?);
                    }
                    items.reverse();
                    self.push(Valor::Lista(items));
                },

                // ─── OBTENER CAMPO ─────────────────────────────────
                OpCode::ObtenerCampo => {
                    let idx = self.leer_byte() as usize;
                    let campo = match &self.chunk.constantes[idx] {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de campo no es texto".into()),
                    };
                    let objeto = self.pop()?;
                    match objeto {
                        Valor::Molde { campos, extra, .. } => {
                            if let Some(v) = campos.get(&campo) {
                                self.push(v.clone());
                            } else if let Some(v) = extra.get(&campo) {
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
                    let idx = self.leer_byte() as usize;
                    let campo = match &self.chunk.constantes[idx] {
                        Valor::Texto(s) => s.clone(),
                        _ => return Err("Nombre de campo no es texto".into()),
                    };
                    let valor = self.pop()?;
                    let mut objeto = self.pop()?;
                    match &mut objeto {
                        Valor::Molde { campos, extra, .. } => {
                            if campos.contains_key(&campo) {
                                campos.insert(campo, valor);
                            } else {
                                // Espacio latente (elástico)
                                extra.insert(campo, valor);
                            }
                        },
                        _ => return Err(format!("No se puede asignar al campo '{}' de un valor que no es molde", campo)),
                    }
                    self.push(objeto);
                },

                // ─── LLAMAR BUILTIN ────────────────────────────────
                OpCode::LlamarBuiltin => {
                    let name_idx = self.leer_byte() as usize;
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
                            match crate::stdlib::shell(&cmd) {
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
            }
        }
    }

    #[inline(always)]
    fn leer_byte(&mut self) -> u8 {
        let byte = self.chunk.codigo[self.ip];
        self.ip += 1;
        byte
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
        let mut vm = VM::nueva(compilador.chunk);
        let resultado = vm.ejecutar();
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
}
