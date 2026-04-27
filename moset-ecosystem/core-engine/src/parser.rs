// ============================================================================
// MOSET — Parser (Analizador Sintáctico)
// ============================================================================
// Convierte la secuencia de Tokens en el U-AST (Árbol Sintáctico Universal).
// Implementación: Descenso Recursivo con soporte para:
//   - Funciones :,] con retorno implícito
//   - Condicionales como expresiones (inline si/sino)
//   - Catch en línea :,[
//   - Moldes (structs atómicos)
//   - Indentación como delimitador de bloques
// ============================================================================

use crate::ast::*;
use crate::lexer::{Token, TokenConPos};

pub struct Parser {
    tokens: Vec<TokenConPos>,
    pos: usize,
}

impl Parser {
    pub fn nuevo(tokens: Vec<TokenConPos>) -> Self {
        Parser { tokens, pos: 0 }
    }

    /// Parsear un programa completo acumulando errores (Error Recovery)
    pub fn parsear(&mut self) -> Result<Programa, String> {
        let mut sentencias = Vec::new();
        let mut errores = Vec::new();
        self.saltar_nuevas_lineas();

        while !self.es_fin() {
            match self.parsear_sentencia() {
                Ok(nodo) => sentencias.push(nodo),
                Err(e) => {
                    errores.push(e);
                    self.sincronizar();
                }
            }
            self.saltar_nuevas_lineas();
        }

        if errores.is_empty() {
            Ok(Programa { sentencias })
        } else {
            Err(errores.join("\n"))
        }
    }

    // ─── Sentencias ──────────────────────────────────────────────────────────

    fn parsear_sentencia(&mut self) -> Result<Nodo, String> {
        self.saltar_nuevas_lineas();

        // Extraer posición inicial de la sentencia para el BUG-004
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };

        let nodo = match self.actual_token() {
            Token::Comentario(_) => self.parsear_comentario(),
            Token::FuncDef => self.parsear_funcion(),
            Token::Molde => self.parsear_molde(),
            Token::Si => self.parsear_si_bloque(),
            Token::Mientras => self.parsear_mientras(),
            Token::Por => self.parsear_por_cada(),
            Token::Mostrar => self.parsear_mostrar(),
            Token::Importar => self.parsear_importar(),
            Token::Devolver => self.parsear_devolver(),
            Token::Pensar => self.parsear_pensar(),
            _ => self.parsear_asignacion_o_expresion(),
        }?;

        // BUG-051: Envolver en Metadata solo si no está ya envuelto para evitar anidamientos redundantes
        if let Nodo::Metadata { .. } = nodo {
            Ok(nodo)
        } else {
            Ok(Nodo::Metadata {
                linea: lin,
                columna: col,
                nodo: Box::new(nodo),
            })
        }
    }

    fn parsear_comentario(&mut self) -> Result<Nodo, String> {
        if let Token::Comentario(texto) = self.actual_token() {
            let t = texto.clone();
            self.avanzar();
            Ok(Nodo::Comentario(t))
        } else {
            Err(self.error("Se esperaba un comentario"))
        }
    }

    /// :,] nombre(params)
    ///     cuerpo
    fn parsear_funcion(&mut self) -> Result<Nodo, String> {
        self.consumir(Token::FuncDef)?;
        let nombre = self.consumir_ident()?;
        self.consumir(Token::ParenIzq)?;

        let mut params = Vec::new();
        if !self.verificar(&Token::ParenDer) {
            params.push(self.consumir_ident()?);
            while self.verificar(&Token::Coma) {
                self.avanzar();
                params.push(self.consumir_ident()?);
            }
        }
        self.consumir(Token::ParenDer)?;
        self.saltar_nuevas_lineas();
        
        // Consumir DosPuntos `:` opcional si el usuario lo escribe, como en otros lenguajes
        if self.verificar(&Token::DosPuntos) {
            self.avanzar();
        }
        
        self.saltar_nuevas_lineas();
        let cuerpo = self.parsear_bloque()?;

        Ok(Nodo::Funcion {
            nombre,
            params,
            cuerpo,
        })
    }

    /// molde Nombre: campo1, campo2       → atómico (rígido)
    /// molde Nombre: campo1, campo2, ...  → elástico (acepta campos dinámicos)
    fn parsear_molde(&mut self) -> Result<Nodo, String> {
        self.consumir_kw(Token::Molde)?;
        let nombre = self.consumir_ident()?;
        self.consumir(Token::DosPuntos)?;

        self.saltar_nuevas_lineas();
        let en_bloque = if self.verificar(&Token::Indent) {
            self.avanzar();
            true
        } else {
            false
        };

        let mut campos = Vec::new();
        let mut elastico = false;

        self.saltar_nuevas_lineas();

        // Primer campo o ... directo
        if self.verificar(&Token::Elipsis) {
            self.avanzar();
            elastico = true;
        } else if !self.verificar(&Token::Dedent) && !self.es_fin() {
            campos.push(self.consumir_ident()?);
            
            // Opcional: ignorar `: Tipo`
            if self.verificar(&Token::DosPuntos) {
                self.avanzar(); // :
                if let Token::Ident(_) = self.actual_token() {
                    self.avanzar(); // Tipo
                }
            }

            self.saltar_nuevas_lineas();
            
            while self.verificar(&Token::Coma) || (en_bloque && !self.verificar(&Token::Dedent) && !self.es_fin()) {
                if self.verificar(&Token::Coma) { self.avanzar(); }
                self.saltar_nuevas_lineas();
                
                if (en_bloque && self.verificar(&Token::Dedent)) || self.es_fin() {
                    break;
                }

                if self.verificar(&Token::Elipsis) {
                    self.avanzar();
                    elastico = true;
                    break;
                }
                campos.push(self.consumir_ident()?);

                // Opcional: ignorar `: Tipo`
                if self.verificar(&Token::DosPuntos) {
                    self.avanzar(); // :
                    if let Token::Ident(_) = self.actual_token() {
                        self.avanzar(); // Tipo
                    }
                }

                self.saltar_nuevas_lineas();
            }
        }

        if en_bloque {
            self.saltar_nuevas_lineas();
            if self.verificar(&Token::Dedent) {
                self.avanzar();
            }
        }

        Ok(Nodo::MoldeDefinicion { nombre, campos, elastico })
    }

    /// si condicion:
    ///     cuerpo
    /// sino:
    ///     cuerpo
    fn parsear_si_bloque(&mut self) -> Result<Nodo, String> {
        self.consumir_kw(Token::Si)?;
        let condicion = self.parsear_expresion()?;
        self.consumir(Token::DosPuntos)?;

        // ¿Es inline o bloque?
        if self.verificar(&Token::NuevaLinea) || self.verificar(&Token::Indent) {
            // Bloque
            self.saltar_nuevas_lineas();
            let cuerpo_si = self.parsear_bloque()?;

            let cuerpo_sino = if self.verificar(&Token::Sino) {
                self.avanzar();
                self.consumir(Token::DosPuntos)?;
                self.saltar_nuevas_lineas();
                Some(self.parsear_bloque()?)
            } else {
                None
            };

            Ok(Nodo::Condicional {
                condicion: Box::new(condicion),
                cuerpo_si,
                cuerpo_sino,
            })
        } else {
            // Inline: si cond: valor_si sino: valor_sino
            let valor_si = self.parsear_asignacion_o_expresion()?;
            let cuerpo_sino = if self.verificar(&Token::Sino) {
                self.avanzar();
                self.consumir(Token::DosPuntos)?;
                let valor_sino = self.parsear_asignacion_o_expresion()?;
                Some(vec![valor_sino])
            } else {
                None
            };

            Ok(Nodo::Condicional {
                condicion: Box::new(condicion),
                cuerpo_si: vec![valor_si],
                cuerpo_sino,
            })
        }
    }

    /// mientras condicion:
    ///     cuerpo
    fn parsear_mientras(&mut self) -> Result<Nodo, String> {
        self.consumir_kw(Token::Mientras)?;
        let condicion = self.parsear_expresion()?;
        self.consumir(Token::DosPuntos)?;
        self.saltar_nuevas_lineas();
        let cuerpo = self.parsear_bloque()?;

        Ok(Nodo::Mientras {
            condicion: Box::new(condicion),
            cuerpo,
        })
    }

    /// por cada variable en iterable:
    ///     cuerpo
    fn parsear_por_cada(&mut self) -> Result<Nodo, String> {
        self.consumir_kw(Token::Por)?;
        self.consumir_kw(Token::Cada)?;
        let variable = self.consumir_ident()?;
        self.consumir_kw(Token::En)?;
        let iterable = self.parsear_expresion()?;
        self.consumir(Token::DosPuntos)?;
        self.saltar_nuevas_lineas();
        let cuerpo = self.parsear_bloque()?;

        Ok(Nodo::PorCada {
            variable,
            iterable: Box::new(iterable),
            cuerpo,
        })
    }

    /// mostrar expresion
    fn parsear_mostrar(&mut self) -> Result<Nodo, String> {
        self.consumir_kw(Token::Mostrar)?;
        let expr = self.parsear_expresion()?;
        Ok(Nodo::Mostrar(Box::new(expr)))
    }

    /// importar modulo
    fn parsear_importar(&mut self) -> Result<Nodo, String> {
        self.consumir_kw(Token::Importar)?;
        let modulo = match self.actual_token() {
            Token::Ident(nombre) => {
                let m = nombre.clone();
                self.avanzar();
                m
            }
            Token::Texto(texto) => {
                let m = texto.clone();
                self.avanzar();
                m
            }
            _ => return Err(self.error(&format!("Se esperaba un identificador o texto, encontré {:?}", self.actual_token()))),
        };
        Ok(Nodo::Importar { modulo })
    }

    /// devolver expresion
    fn parsear_devolver(&mut self) -> Result<Nodo, String> {
        self.consumir_kw(Token::Devolver)?;
        let expr = self.parsear_expresion()?;
        Ok(Nodo::Retornar(Box::new(expr)))
    }

    /// pensar:
    ///     cuerpo
    fn parsear_pensar(&mut self) -> Result<Nodo, String> {
        self.consumir_kw(Token::Pensar)?;
        
        let cuerpo = if self.verificar(&Token::DosPuntos) {
            self.consumir(Token::DosPuntos)?;
            self.saltar_nuevas_lineas();
            if self.verificar(&Token::Indent) {
                self.parsear_bloque()?
            } else {
                vec![self.parsear_sentencia()?]
            }
        } else {
            // Support legacy { }
            self.consumir(Token::LlaveIzq)?;
            self.saltar_nuevas_lineas();

            let mut c = Vec::new();
            while !self.verificar(&Token::LlaveDer) && !self.es_fin() {
                self.saltar_nuevas_lineas();
                // Skip Indent/Dedent if any get mixed inside {}
                while self.verificar(&Token::Indent) || self.verificar(&Token::Dedent) {
                    self.avanzar();
                }
                if self.verificar(&Token::LlaveDer) || self.es_fin() {
                    break;
                }
                c.push(self.parsear_sentencia()?);
                self.saltar_nuevas_lineas();
            }
            self.consumir(Token::LlaveDer)?;
            c
        };

        Ok(Nodo::Pensar { cuerpo })
    }

    /// nombre = expresion  |  obj.campo = expresion  |  lista[indice] = expresion | expresion
    fn parsear_asignacion_o_expresion(&mut self) -> Result<Nodo, String> {
        if let Token::Ident(nombre) = self.actual_token() {
            // ── obj.campo = valor (asignación de campo) ──
            if self.peek_token(1) == Some(&Token::Punto) {
                if let Some(Token::Ident(_)) = self.peek_token(2) {
                    if self.peek_token(3) == Some(&Token::Igual) {
                        let obj = nombre.clone();
                        self.avanzar(); // consumir obj
                        self.avanzar(); // consumir .
                        let campo = self.consumir_ident()?;
                        self.avanzar(); // consumir =
                        let valor = self.parsear_expresion()?;
                        return Ok(Nodo::AsignacionCampo {
                            objeto: obj,
                            campo,
                            valor: Box::new(valor),
                        });
                    }
                }
            }

            // ── lista[indice] = valor (asignación de índice) ──
            if self.peek_token(1) == Some(&Token::CorcheteIzq) {
                // Necesitamos verificar si después del corchete derecho hay un =
                // Pero el índice puede ser una expresión compleja, así que no podemos 
                // solo mirar peek_token.
                // En lugar de pre-escanear, podemos probar a parsear el índice
                // O mejor aún, parsear la expresión izquierda completa y ver si le sigue un '='.
                // Ya que `parsear_expresion` maneja `AccesoIndice`.
            }

            // ── ident = expr (asignación simple) ──
            if self.peek_token(1) == Some(&Token::Igual) {
                let nombre = nombre.clone();
                self.avanzar(); // consumir ident
                self.avanzar(); // consumir =
                let valor = self.parsear_expresion()?;
                return Ok(Nodo::Asignacion {
                    nombre,
                    valor: Box::new(valor),
                });
            }
        }

        // Si no es asignación simple ni de campo, parseamos como expresión.
        // PERO puede ser una asignación a índice: `lista[1] = expr`
        let expr = self.parsear_expresion()?;
        
        if self.verificar(&Token::Igual) {
            self.avanzar(); // =
            let valor = self.parsear_expresion()?;
            let mut base_expr = expr;
            if let Nodo::Metadata { nodo: inner, .. } = base_expr {
                base_expr = *inner;
            }
            if let Nodo::AccesoIndice { lista, indice } = base_expr {
                // BUG-052: Permitir expresiones en AsignacionIndice en lugar de solo identificador
                return Ok(Nodo::AsignacionIndice {
                    lista,
                    indice,
                    valor: Box::new(valor),
                });
            } else {
                return Err(self.error(&format!("Asignación no válida a una expresión: {:?}", base_expr)));
            }
        }
        
        Ok(expr)
    }

    // ─── Bloques (indentación) ───────────────────────────────────────────────

    fn parsear_bloque(&mut self) -> Result<Vec<Nodo>, String> {
        self.consumir(Token::Indent)?;
        let mut sentencias = Vec::new();

        while !self.verificar(&Token::Dedent) && !self.es_fin() {
            self.saltar_nuevas_lineas();
            if self.verificar(&Token::Dedent) || self.es_fin() {
                break;
            }
            sentencias.push(self.parsear_sentencia()?);
            self.saltar_nuevas_lineas();
        }

        if self.verificar(&Token::Dedent) {
            self.avanzar();
        }

        Ok(sentencias)
    }

    // ─── Expresiones (precedencia por descenso recursivo) ────────────────────

    fn parsear_expresion(&mut self) -> Result<Nodo, String> {
        // Inline conditional: si cond: a sino: b (como expresión)
        if self.verificar(&Token::Si) {
            return self.parsear_si_bloque();
        }
        self.parsear_o_logico()
    }

    /// o (or)
    fn parsear_o_logico(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_o_logico_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    fn parsear_o_logico_inner(&mut self) -> Result<Nodo, String> {
        let mut izq = self.parsear_y_logico()?;
        while self.verificar(&Token::O) {
            self.avanzar();
            let der = self.parsear_y_logico()?;
            izq = Nodo::Binario {
                izq: Box::new(izq),
                op: OpBinario::O,
                der: Box::new(der),
            };
        }
        Ok(izq)
    }

    /// y (and)
    fn parsear_y_logico(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_y_logico_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    fn parsear_y_logico_inner(&mut self) -> Result<Nodo, String> {
        let mut izq = self.parsear_igualdad()?;
        while self.verificar(&Token::Y) {
            self.avanzar();
            let der = self.parsear_igualdad()?;
            izq = Nodo::Binario {
                izq: Box::new(izq),
                op: OpBinario::Y,
                der: Box::new(der),
            };
        }
        Ok(izq)
    }

    /// == !=
    fn parsear_igualdad(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_igualdad_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    fn parsear_igualdad_inner(&mut self) -> Result<Nodo, String> {
        let mut izq = self.parsear_comparacion()?;
        loop {
            let op = match self.actual_token() {
                Token::IgualIgual => OpBinario::Igual,
                Token::NoIgual => OpBinario::NoIgual,
                _ => break,
            };
            self.avanzar();
            let der = self.parsear_comparacion()?;
            izq = Nodo::Binario {
                izq: Box::new(izq),
                op,
                der: Box::new(der),
            };
        }
        Ok(izq)
    }

    /// > < >= <=
    fn parsear_comparacion(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_comparacion_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    fn parsear_comparacion_inner(&mut self) -> Result<Nodo, String> {
        let mut izq = self.parsear_suma()?;
        loop {
            let op = match self.actual_token() {
                Token::Mayor => OpBinario::Mayor,
                Token::Menor => OpBinario::Menor,
                Token::MayorIgual => OpBinario::MayorIgual,
                Token::MenorIgual => OpBinario::MenorIgual,
                _ => break,
            };
            self.avanzar();
            let der = self.parsear_suma()?;
            izq = Nodo::Binario {
                izq: Box::new(izq),
                op,
                der: Box::new(der),
            };
        }
        Ok(izq)
    }

    /// + -
    fn parsear_suma(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_suma_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    fn parsear_suma_inner(&mut self) -> Result<Nodo, String> {
        let mut izq = self.parsear_factor()?;
        loop {
            let op = match self.actual_token() {
                Token::Mas => OpBinario::Sumar,
                Token::Menos => OpBinario::Restar,
                _ => break,
            };
            self.avanzar();
            let der = self.parsear_factor()?;
            izq = Nodo::Binario {
                izq: Box::new(izq),
                op,
                der: Box::new(der),
            };
        }
        Ok(izq)
    }

    /// * / %
    fn parsear_factor(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_factor_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    fn parsear_factor_inner(&mut self) -> Result<Nodo, String> {
        let mut izq = self.parsear_unario()?;
        loop {
            let op = match self.actual_token() {
                Token::Asterisco => OpBinario::Multiplicar,
                Token::Barra => OpBinario::Dividir,
                Token::Modulo => OpBinario::Modulo,
                _ => break,
            };
            self.avanzar();
            let der = self.parsear_unario()?;
            izq = Nodo::Binario {
                izq: Box::new(izq),
                op,
                der: Box::new(der),
            };
        }
        Ok(izq)
    }

    /// -expr  |  no expr  |  !expr (colapso cuántico)
    fn parsear_unario(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_unario_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    fn parsear_unario_inner(&mut self) -> Result<Nodo, String> {
        match self.actual_token() {
            Token::Menos => {
                self.avanzar();
                let expr = self.parsear_unario()?;
                Ok(Nodo::Unario {
                    op: OpUnario::Negar,
                    expr: Box::new(expr),
                })
            }
            Token::No => {
                self.avanzar();
                let expr = self.parsear_unario()?;
                Ok(Nodo::Unario {
                    op: OpUnario::No,
                    expr: Box::new(expr),
                })
            }
            // ! → Colapso cuántico (observación)
            Token::Exclamacion => {
                self.avanzar();
                let expr = self.parsear_unario()?;
                Ok(Nodo::Colapsar(Box::new(expr)))
            }
            _ => self.parsear_postfix(),
        }
    }

    /// Llamadas, acceso a campos, índices, catch inline
    fn parsear_postfix(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_postfix_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    fn parsear_postfix_inner(&mut self) -> Result<Nodo, String> {
        let mut expr = self.parsear_primario()?;

        loop {
            match self.actual_token() {
                // Llamada: func(args)
                Token::ParenIzq => {
                    self.avanzar();
                    let mut args = Vec::new();
                    if !self.verificar(&Token::ParenDer) {
                        args.push(self.parsear_expresion()?);
                        while self.verificar(&Token::Coma) {
                            self.avanzar();
                            args.push(self.parsear_expresion()?);
                        }
                    }
                    self.consumir(Token::ParenDer)?;
                    let mut es_metodo = false;
                    let mut obj = None;
                    let mut metodo = String::new();

                    if let Nodo::AccesoCampo { objeto, campo } = expr.clone() {
                        es_metodo = true;
                        obj = Some(objeto);
                        metodo = campo;
                    }

                    if es_metodo {
                        expr = Nodo::LlamadaMetodo {
                            objeto: obj.unwrap(),
                            metodo,
                            args,
                        };
                    } else {
                        expr = Nodo::Llamada {
                            funcion: Box::new(expr),
                            args,
                        };
                    }
                }
                // Acceso a campo: obj.campo
                Token::Punto => {
                    self.avanzar();
                    let campo = self.consumir_ident()?;
                    expr = Nodo::AccesoCampo {
                        objeto: Box::new(expr),
                        campo,
                    };
                }
                // Acceso por índice: lista[i] (base 1)
                Token::CorcheteIzq => {
                    self.avanzar();
                    let indice = self.parsear_expresion()?;
                    self.consumir(Token::CorcheteDer)?;
                    expr = Nodo::AccesoIndice {
                        lista: Box::new(expr),
                        indice: Box::new(indice),
                    };
                }
                // Catch en línea: expr :,[ fallback
                Token::CatchDef => {
                    self.avanzar();
                    let fallback = self.parsear_expresion()?;
                    expr = Nodo::CatchEnLinea {
                        expresion: Box::new(expr),
                        fallback: Box::new(fallback),
                    };
                }
                _ => break,
            }
        }

        Ok(expr)
    }

    /// Valores primarios (con metadata de posición real)
    fn parsear_primario(&mut self) -> Result<Nodo, String> {
        let (lin, col) = if let Some(tc) = self.actual_token_full() {
            (tc.linea, tc.columna)
        } else {
            (1, 1)
        };
        let nodo = self.parsear_primario_inner()?;
        Ok(self.envolver_meta(lin, col, nodo))
    }

    /// Implementación interna de los valores primarios
    fn parsear_primario_inner(&mut self) -> Result<Nodo, String> {
        let tok = self.actual_token();
        match tok {
            Token::Entero(n) => {
                let v = *n;
                self.avanzar();
                Ok(Nodo::EnteroLit(v))
            }
            Token::Decimal(n) => {
                let v = *n;
                self.avanzar();
                Ok(Nodo::DecimalLit(v))
            }
            Token::Texto(s) => {
                let v = s.clone();
                self.avanzar();
                Ok(Nodo::TextoLit(v))
            }
            Token::Verdadero => {
                self.avanzar();
                Ok(Nodo::BooleanoLit(true))
            }
            Token::Falso => {
                self.avanzar();
                Ok(Nodo::BooleanoLit(false))
            }
            Token::Nulo => {
                self.avanzar();
                Ok(Nodo::NuloLit)
            }
            Token::Este => {
                self.avanzar();
                Ok(Nodo::Este)
            }
            Token::Ident(nombre) => {
                let n = nombre.clone();
                self.avanzar();

                // ── Mold instantiation: Nombre { campo: valor, ... } ──
                // Solo si el nombre empieza con mayúscula (convención de molde)
                if n.chars().next().is_some_and(|c| c.is_uppercase())
                    && self.verificar(&Token::LlaveIzq)
                {
                    self.avanzar(); // consumir {
                    let mut valores = Vec::new();
                    while !self.verificar(&Token::LlaveDer) && !self.es_fin() {
                        let campo = self.consumir_ident()?;
                        self.consumir(Token::DosPuntos)?;
                        let val = self.parsear_expresion()?;
                        valores.push((campo, val));
                        if self.verificar(&Token::Coma) {
                            self.avanzar();
                        }
                    }
                    self.consumir(Token::LlaveDer)?;
                    return Ok(Nodo::MoldeInstancia {
                        nombre: n,
                        valores,
                    });
                }

                Ok(Nodo::Identificador(n))
            }
            // Expresión parentizada: (expr)
            Token::ParenIzq => {
                self.avanzar();
                let expr = self.parsear_expresion()?;
                self.consumir(Token::ParenDer)?;
                Ok(expr)
            }
            // Lista literal: [a, b, c]
            Token::CorcheteIzq => {
                self.avanzar();
                let mut elementos = Vec::new();
                if !self.verificar(&Token::CorcheteDer) {
                    elementos.push(self.parsear_expresion()?);
                    while self.verificar(&Token::Coma) {
                        self.avanzar();
                        elementos.push(self.parsear_expresion()?);
                    }
                }
                self.consumir(Token::CorcheteDer)?;
                Ok(Nodo::ListaLit(elementos))
            }
            // Await: :,\ expresion
            Token::Esperar => {
                self.avanzar();
                let expr = self.parsear_expresion()?;
                Ok(Nodo::Esperar(Box::new(expr)))
            }
            // Bit Cuántico: Bit:~ → superposición por defecto (50/50)
            Token::BitCuantico => {
                self.avanzar();
                // Default: probabilidad uniforme α = β = 1/√2
                let inv_sqrt2 = 1.0_f64 / 2.0_f64.sqrt();
                Ok(Nodo::SuperposicionLit {
                    alpha: inv_sqrt2,
                    beta: inv_sqrt2,
                })
            }
            // Bit Sesgado: Bit:[0.85] → superposición con probabilidad custom
            // prob = P(verdadero) = |β|²  →  β = √prob, α = √(1-prob)
            Token::BitSesgado(prob) => {
                let p = *prob;
                self.avanzar();
                let beta = p.sqrt();
                let alpha = (1.0 - p).sqrt();
                Ok(Nodo::SuperposicionLit { alpha, beta })
            }
            // pensar { ... } como expresión (ej: resultado = pensar { ... })
            Token::Pensar => {
                self.parsear_pensar()
            }
            // Closure (función anónima): :,) (arg1, arg2): cuerpo
            Token::ClosureDef => {
                self.avanzar(); // Consumir :,)
                
                let mut params = Vec::new();
                
                // Los parámetros pueden o no tener paréntesis.
                // Si hay paréntesis, los consumimos.
                let tiene_paren = self.verificar(&Token::ParenIzq);
                if tiene_paren {
                    self.avanzar(); // Consumir (
                }
                
                if !self.verificar(&Token::ParenDer) && !self.verificar(&Token::DosPuntos) && !self.verificar(&Token::Indent) {
                    params.push(self.consumir_ident()?);
                    while self.verificar(&Token::Coma) {
                        self.avanzar(); // Consumir ,
                        params.push(self.consumir_ident()?);
                    }
                }
                
                if tiene_paren {
                    self.consumir(Token::ParenDer)?; // Consumir )
                }
                
                self.saltar_nuevas_lineas();
                
                if self.verificar(&Token::DosPuntos) {
                    self.avanzar(); // Consumir : opcional
                }
                
                let cuerpo = if self.verificar(&Token::NuevaLinea) || self.verificar(&Token::Indent) {
                    self.saltar_nuevas_lineas();
                    self.parsear_bloque()?
                } else {
                    let expr = self.parsear_asignacion_o_expresion()?;
                    vec![Nodo::Retornar(Box::new(expr))]
                };
                
                Ok(Nodo::Closure {
                    params,
                    cuerpo,
                })
            }
            _ => Err(self.error(&format!(
                "Expresión inesperada: {:?}",
                self.actual_token()
            ))),
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /// Envuelve cualquier nodo en un Nodo::Metadata usando una posición específica
    fn envolver_meta(&self, linea: usize, columna: usize, nodo: Nodo) -> Nodo {
        // BUG-051: Evitar el anidamiento recursivo de Metadata
        if let Nodo::Metadata { .. } = nodo {
            return nodo; // Si ya es Metadata, no lo envolvemos de nuevo
        }
        Nodo::Metadata {
            linea,
            columna,
            nodo: Box::new(nodo),
        }
    }

    fn actual_token(&self) -> &Token {
        if self.pos < self.tokens.len() {
            &self.tokens[self.pos].token
        } else {
            &Token::Eof
        }
    }

    fn actual_token_full(&self) -> Option<&TokenConPos> {
        if self.pos < self.tokens.len() {
            Some(&self.tokens[self.pos])
        } else {
            None
        }
    }

    fn peek_token(&self, offset: usize) -> Option<&Token> {
        self.tokens.get(self.pos + offset).map(|t| &t.token)
    }

    fn avanzar(&mut self) {
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
    }

    fn verificar(&self, token: &Token) -> bool {
        std::mem::discriminant(self.actual_token()) == std::mem::discriminant(token)
    }

    fn consumir(&mut self, esperado: Token) -> Result<(), String> {
        if self.verificar(&esperado) {
            self.avanzar();
            Ok(())
        } else {
            Err(self.error(&format!(
                "Se esperaba {:?}, encontré {:?}",
                esperado,
                self.actual_token()
            )))
        }
    }

    fn consumir_kw(&mut self, esperado: Token) -> Result<(), String> {
        self.consumir(esperado)
    }

    fn consumir_ident(&mut self) -> Result<String, String> {
        if let Token::Ident(nombre) = self.actual_token() {
            let n = nombre.clone();
            self.avanzar();
            Ok(n)
        } else {
            Err(self.error(&format!(
                "Se esperaba un identificador, encontré {:?}",
                self.actual_token()
            )))
        }
    }

    fn saltar_nuevas_lineas(&mut self) {
        while self.verificar(&Token::NuevaLinea) {
            self.avanzar();
        }
    }

    fn es_fin(&self) -> bool {
        matches!(self.actual_token(), Token::Eof)
    }

    fn error(&self, msg: &str) -> String {
        let (linea, col) = if self.pos < self.tokens.len() {
            (self.tokens[self.pos].linea, self.tokens[self.pos].columna)
        } else {
            (0, 0)
        };
        format!("[línea {}, col {}] {}", linea, col, msg)
    }

    /// Método para salir de un estado de pánico sintáctico (Error Recovery)
    fn sincronizar(&mut self) {
        self.avanzar();

        while !self.es_fin() {
            // Un punto de resincronización seguro es después de un salto de línea
            if self.pos > 0 && self.tokens[self.pos - 1].token == Token::NuevaLinea {
                return;
            }

            // O si nos topamos con un "keyword" de inicio de sentencia
            match self.actual_token() {
                Token::Si | Token::Mientras | Token::Por | Token::Mostrar | 
                Token::FuncDef | Token::Molde | Token::Importar | Token::Pensar | Token::Devolver => return,
                _ => self.avanzar(),
            }
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::Lexer;

    fn parsear_codigo(codigo: &str) -> Programa {
        let mut lexer = Lexer::nuevo(codigo, None);
        let tokens = lexer.tokenizar().unwrap();
        let mut parser = Parser::nuevo(tokens);
        parser.parsear().unwrap()
    }

    /// Desenvuelve el Nodo::Metadata wrapper que el parser agrega a toda sentencia o subexpresión.
    fn unwrap_meta(nodo: &Nodo) -> &Nodo {
        match nodo {
            Nodo::Metadata { nodo, .. } => unwrap_meta(nodo),
            other => other,
        }
    }

    #[test]
    fn test_mostrar_texto() {
        let prog = parsear_codigo("mostrar \"Hola\"");
        assert_eq!(prog.sentencias.len(), 1);
        assert!(matches!(unwrap_meta(&prog.sentencias[0]), Nodo::Mostrar(_)));
    }

    #[test]
    fn test_asignacion() {
        let prog = parsear_codigo("edad = 25");
        assert!(matches!(
            unwrap_meta(&prog.sentencias[0]),
            Nodo::Asignacion { nombre, .. } if nombre == "edad"
        ));
    }

    #[test]
    fn test_expresion_aritmetica() {
        let prog = parsear_codigo("x = 2 + 3 * 4");
        // Debe respetar precedencia: 2 + (3 * 4)
        if let Nodo::Asignacion { valor, .. } = unwrap_meta(&prog.sentencias[0]) {
            assert!(matches!(unwrap_meta(valor.as_ref()), Nodo::Binario { op: OpBinario::Sumar, .. }));
        }
    }

    #[test]
    fn test_bit_cuantico() {
        let prog = parsear_codigo("q = Bit:~");
        if let Nodo::Asignacion { nombre, valor } = unwrap_meta(&prog.sentencias[0]) {
            assert_eq!(nombre, "q");
            assert!(matches!(unwrap_meta(valor.as_ref()), Nodo::SuperposicionLit { .. }));
        } else {
            panic!("Se esperaba asignación");
        }
    }

    #[test]
    fn test_colapso_cuantico() {
        let prog = parsear_codigo("x = !q");
        if let Nodo::Asignacion { valor, .. } = unwrap_meta(&prog.sentencias[0]) {
            assert!(matches!(unwrap_meta(valor.as_ref()), Nodo::Colapsar(_)));
        } else {
            panic!("Se esperaba colapso");
        }
    }

    #[test]
    fn test_bit_sesgado() {
        let prog = parsear_codigo("q = Bit:[0.85]");
        if let Nodo::Asignacion { nombre, valor } = unwrap_meta(&prog.sentencias[0]) {
            assert_eq!(nombre, "q");
            if let Nodo::SuperposicionLit { alpha, beta } = unwrap_meta(valor.as_ref()) {
                // β = √0.85 ≈ 0.9220, α = √0.15 ≈ 0.3873
                assert!((beta * beta - 0.85).abs() < 0.001,
                    "β² debería ser ~0.85, es {}", beta * beta);
                assert!((alpha * alpha - 0.15).abs() < 0.001,
                    "α² debería ser ~0.15, es {}", alpha * alpha);
            } else {
                panic!("Se esperaba SuperposicionLit");
            }
        } else {
            panic!("Se esperaba asignación");
        }
    }

    #[test]
    fn test_molde_rigido() {
        let prog = parsear_codigo("molde Punto: x, z");
        if let Nodo::MoldeDefinicion { nombre, campos, elastico } = unwrap_meta(&prog.sentencias[0]) {
            assert_eq!(nombre, "Punto");
            assert_eq!(campos, &vec!["x".to_string(), "z".to_string()]);
            assert!(!elastico, "Sin ... debe ser rígido");
        } else {
            panic!("Se esperaba MoldeDefinicion");
        }
    }

    #[test]
    fn test_molde_elastico() {
        let prog = parsear_codigo("molde Escaneo: ip, puerto, ...");
        if let Nodo::MoldeDefinicion { nombre, campos, elastico } = unwrap_meta(&prog.sentencias[0]) {
            assert_eq!(nombre, "Escaneo");
            assert_eq!(campos, &vec!["ip".to_string(), "puerto".to_string()]);
            assert!(elastico, "Con ... debe ser elástico");
        } else {
            panic!("Se esperaba MoldeDefinicion elástico");
        }
    }

    #[test]
    fn test_molde_puro_elastico() {
        let prog = parsear_codigo("molde Libre: ...");
        if let Nodo::MoldeDefinicion { nombre, campos, elastico } = unwrap_meta(&prog.sentencias[0]) {
            assert_eq!(nombre, "Libre");
            assert!(campos.is_empty(), "Sin campos fijos");
            assert!(elastico);
        } else {
            panic!("Se esperaba MoldeDefinicion puro elástico");
        }
    }

    #[test]
    fn test_asignacion_campo() {
        let prog = parsear_codigo("obj.campo = 42");
        if let Nodo::AsignacionCampo { objeto, campo, valor } = unwrap_meta(&prog.sentencias[0]) {
            assert_eq!(objeto, "obj");
            assert_eq!(campo, "campo");
            assert!(matches!(unwrap_meta(valor.as_ref()), Nodo::EnteroLit(42)));
        } else {
            panic!("Se esperaba AsignacionCampo, got {:?}", unwrap_meta(&prog.sentencias[0]));
        }
    }

    #[test]
    fn test_error_recovery() {
        // En lugar de crashear, el parser recupera la línea final
        let mut lexer = Lexer::nuevo("x = \n y = * 5\n z = 10", None);
        let tokens = lexer.tokenizar().unwrap();
        let mut parser = Parser::nuevo(tokens);
        let resultado = parser.parsear();
        
        assert!(resultado.is_err());
        let errs = resultado.unwrap_err();
        assert!(errs.contains("línea 1"));
        assert!(errs.contains("línea 2"));
    }
}
