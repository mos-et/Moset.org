// ============================================================================
// MOSET — Analizador Léxico (Lexer)
// ============================================================================
// Tokeniza archivos .et respetando la Tabla Léxica Maestra:
//   :,]  → FuncDef      (función/rutina)
//   :,[  → CatchDef     (plan B / excepción)
//   :,\  → Esperar      (async/await)
//   :@   → Comentario   (silenciamiento total)
//
// Soporta diccionarios multi-idioma: el mismo token universal
// se activa con "si" (español) o "if" (inglés).
// ============================= ===============================================

use std::collections::HashMap;

// ─── Token Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    // === Identidad Visual Moset ===
    FuncDef,            // :,]   carita función
    CatchDef,           // :,[   carita catch
    Esperar,            // :,\   carita await
    ClosureDef,         // :,)   carita closure (función anónima)
    Comentario(String), // :@    silenciamiento
    BitCuantico,        // Bit:~ superposición cuántica (50/50)
    BitSesgado(f64),    // Bit:[0.85] superposición con probabilidad custom
    Exclamacion,        // !     colapso / observación

    // === Literales ===
    Entero(i64),
    Decimal(f64),
    Texto(String),
    Verdadero,  // verdadero / true
    Falso,      // falso / false
    Nulo,       // nulo / null

    // === Palabras Clave (Tokens Universales) ===
    Si,         // si / if
    Sino,       // sino / else
    Mientras,   // mientras / while
    Por,        // por / for
    Cada,       // cada / each
    En,         // en / in
    Molde,      // molde / struct
    Mostrar,    // mostrar / print
    Importar,   // importar / import
    Y,          // y / and
    O,          // o / or
    No,         // no / not
    Devolver,   // devolver / return
    Pensar,     // pensar / think (shadow env)
    Este,       // este / this / self (OOP)

    // === Identificadores ===
    Ident(String),

    // === Operadores ===
    Mas,        // +
    Menos,      // -
    Asterisco,  // *
    Barra,      // /
    Modulo,     // %
    Igual,      // =
    IgualIgual, // ==
    NoIgual,    // !=
    Mayor,      // >
    Menor,      // <
    MayorIgual, // >=
    MenorIgual, // <=

    // === Delimitadores ===
    ParenIzq,    // (
    ParenDer,    // )
    CorcheteIzq, // [
    CorcheteDer, // ]
    LlaveIzq,    // {
    LlaveDer,    // }
    Coma,        // ,
    DosPuntos,   // :
    Punto,       // .
    Elipsis,     // ... (molde elástico)

    // === Interpolación de String (Fase futura: AST nativo) ===
    // Actualmente la interpolación se resuelve expandiendo a Texto+Mas en el lexer.
    #[allow(dead_code)]
    InterpolIni,        // inicio de expresión interpolada dentro de string
    #[allow(dead_code)]
    InterpolFin,        // fin de expresión interpolada dentro de string

    // === Estructura ===
    NuevaLinea,
    Indent,
    Dedent,
    Eof,
}

/// Token con metadata de posición para errores claros
#[derive(Debug, Clone)]
pub struct TokenConPos {
    pub token: Token,
    pub linea: usize,
    pub columna: usize,
}

// ─── Lexer ───────────────────────────────────────────────────────────────────

pub struct Lexer {
    fuente: Vec<char>,
    pos: usize,
    linea: usize,
    col: usize,
    palabras_clave: HashMap<String, Token>,
    indent_stack: Vec<usize>,
    idioma: Option<String>,
}

impl Lexer {
    /// Crear un nuevo Lexer con diccionario opcional de idioma
    pub fn nuevo(fuente: &str, idioma: Option<&str>) -> Self {
        let mut kw = HashMap::new();

        // === Cargar Diccionario Omníglota (12 idiomas simultáneos) ===
        // Español, Inglés, Portugués, Italiano, Francés, Alemán, Chino, Japonés, Coreano, Ruso, Hindi, Árabe
        let mappings = vec![
            (Token::Si, vec!["si", "if", "se", "wenn", "如果", "もし", "만약", "если", "यदि", "إذا"]),
            (Token::Sino, vec!["sino", "else", "senao", "senão", "altrimenti", "sinon", "sonst", "否则", "それとも", "그렇지_않으면", "иначе", "अन्यथा", "وإلا"]),
            (Token::Mientras, vec!["mientras", "while", "enquanto", "mentre", "tant_que", "solange", "当", "間", "동안", "пока", "जब", "بينما"]),
            (Token::Por, vec!["por", "for", "per", "pour", "fuer", "für", "为", "ため", "위해", "для", "के_लिए", "ل"]),
            (Token::Cada, vec!["cada", "each", "ogni", "chaque", "jeder", "每", "各", "각", "каждый", "प्रत्येक", "كل"]),
            (Token::En, vec!["en", "in", "em", "dans", "在", "に", "에", "в", "में", "في"]),
            (Token::Molde, vec!["molde", "mold", "modello", "modele", "modèle", "struktur", "结构", "構造", "틀", "шаблон", "सांचा", "قالب"]),
            (Token::Mostrar, vec!["mostrar", "show", "mostra", "afficher", "zeigen", "显示", "表示", "표시하다", "показать", "दिखाएं", "يعرض"]),
            (Token::Importar, vec!["importar", "import", "importa", "importer", "importieren", "导入", "インポート", "가져오기", "импорт", "आयात", "استيراد"]),
            (Token::Verdadero, vec!["verdadero", "true", "verdadeiro", "vero", "vrai", "wahr", "真", "참", "истина", "सत्य", "صحيح"]),
            (Token::Falso, vec!["falso", "false", "faux", "falsch", "假", "偽", "거짓", "ложь", "असत्य", "خطأ"]),
            (Token::Nulo, vec!["nulo", "null", "nullo", "nul", "空", "ヌル", "빈", "нуль", "शून्य", "لا_شيء"]),
            (Token::Y, vec!["y", "and", "e", "et", "und", "和", "と", "와", "и", "और", "و"]),
            (Token::O, vec!["o", "or", "ou", "oder", "或", "または", "또는", "или", "या", "أو"]),
            (Token::No, vec!["no", "not", "nao", "não", "non", "nicht", "不", "ない", "아니", "нет", "नहीं", "لا"]),
            (Token::Devolver, vec!["devolver", "return", "retornar", "ritorna", "retourner", "zurueckgeben", "zurückgeben", "返回", "戻る", "반환", "вернуть", "वापसी", "عودة"]),
            (Token::Pensar, vec!["pensar", "think", "pensa", "penser", "denken", "思考", "考える", "생각하다", "думать", "सोच", "يفكر"]),
            (Token::Este, vec!["este", "this", "self", "esse", "questo", "ce", "dies", "这", "これ", "이것", "это", "यह", "هذا"]),
        ];

        for (token_type, words) in mappings {
            for word in words {
                kw.insert(word.to_string(), token_type.clone());
            }
        }

        Lexer {
            fuente: fuente.chars().collect(),
            pos: 0,
            linea: 1,
            col: 1,
            palabras_clave: kw,
            indent_stack: vec![0],
            idioma: idioma.map(|s| s.to_string()),
        }
    }

    /// Tokenizar el archivo fuente completo
    pub fn tokenizar(&mut self) -> Result<Vec<TokenConPos>, String> {
        let mut tokens = Vec::new();
        let mut inicio_linea = true;

        while self.pos < self.fuente.len() {
            // ── Manejo de indentación al inicio de línea ──
            if inicio_linea {
                self.procesar_indentacion(&mut tokens)?;
                inicio_linea = false;
                // Puede quedar en EOF o en una línea vacía
                if self.pos >= self.fuente.len() {
                    break;
                }
                // Si después de la indentación hay un newline, es línea vacía
                if self.actual() == '\n' || self.actual() == '\r' {
                    self.consumir_newline(&mut tokens);
                    inicio_linea = true;
                    continue;
                }
            }

            let c = self.actual();

            match c {
                // ── Espacios (no al inicio de línea) ──
                ' ' | '\t' => {
                    self.avanzar();
                }

                // ── Saltos de línea ──
                '\n' | '\r' => {
                    self.consumir_newline(&mut tokens);
                    inicio_linea = true;
                }

                // ── Tokens Moset: :,] :,[ :,\ :@ y : ──
                ':' => {
                    let lin = self.linea;
                    let col = self.col;
                    if self.peek(1) == Some(',') {
                        match self.peek(2) {
                            Some(']') => {
                                tokens.push(TokenConPos {
                                    token: Token::FuncDef,
                                    linea: lin,
                                    columna: col,
                                });
                                self.avanzar_n(3);
                            }
                            Some(')') => {
                                tokens.push(TokenConPos {
                                    token: Token::ClosureDef,
                                    linea: lin,
                                    columna: col,
                                });
                                self.avanzar_n(3);
                            }
                            Some('[') => {
                                tokens.push(TokenConPos {
                                    token: Token::CatchDef,
                                    linea: lin,
                                    columna: col,
                                });
                                self.avanzar_n(3);
                            }
                            Some('\\') => {
                                tokens.push(TokenConPos {
                                    token: Token::Esperar,
                                    linea: lin,
                                    columna: col,
                                });
                                self.avanzar_n(3);
                            }
                            _ => {
                                tokens.push(TokenConPos {
                                    token: Token::DosPuntos,
                                    linea: lin,
                                    columna: col,
                                });
                                self.avanzar();
                            }
                        }
                    } else if self.peek(1) == Some('@') {
                        // Comentario :@ → silenciar resto de línea
                        self.avanzar_n(2);
                        let inicio = self.pos;
                        while self.pos < self.fuente.len()
                            && self.actual() != '\n'
                            && self.actual() != '\r'
                        {
                            self.avanzar();
                        }
                        let contenido: String =
                            self.fuente[inicio..self.pos].iter().collect();
                        tokens.push(TokenConPos {
                            token: Token::Comentario(contenido.trim().to_string()),
                            linea: lin,
                            columna: col,
                        });
                    } else {
                        tokens.push(TokenConPos {
                            token: Token::DosPuntos,
                            linea: lin,
                            columna: col,
                        });
                        self.avanzar();
                    }
                }

                // ── Cadenas de texto (con soporte para interpolación {expr}) ──
                '"' => {
                    let lin = self.linea;
                    let col = self.col;
                    self.avanzar(); // consumir "
                    let mut texto = String::new();
                    let mut tiene_interpolacion = false;

                    while self.pos < self.fuente.len() && self.actual() != '"' {
                        // ── Interpolación: {expr} ──
                        if self.actual() == '{' {
                            tiene_interpolacion = true;
                            // Emitir el texto acumulado (o "" si es la primera interpolación)
                            // para garantizar que el + siempre tenga lado izquierdo
                            tokens.push(TokenConPos {
                                token: Token::Texto(texto.clone()),
                                linea: lin,
                                columna: col,
                            });
                            texto.clear();

                            // Emitir + para concatenar
                            tokens.push(TokenConPos {
                                token: Token::Mas,
                                linea: self.linea,
                                columna: self.col,
                            });

                            self.avanzar(); // consumir {

                            // Tokenizar la expresión interna hasta encontrar }
                            let mut depth = 1;
                            let mut expr_chars = Vec::new();
                            while self.pos < self.fuente.len() && depth > 0 {
                                match self.actual() {
                                    '{' => { depth += 1; expr_chars.push(self.actual()); }
                                    '}' => {
                                        depth -= 1;
                                        if depth > 0 { expr_chars.push(self.actual()); }
                                    }
                                    c => expr_chars.push(c),
                                }
                                self.avanzar();
                            }

                            if depth != 0 {
                                return Err(format!(
                                    "Interpolación sin cerrar '}}' en línea {}, columna {}",
                                    lin, col
                                ));
                            }

                            // Sub-lexear la expresión interna
                            let expr_str: String = expr_chars.into_iter().collect();
                            let mut sub_lex = Lexer::nuevo(&expr_str, self.idioma.as_deref());
                            let sub_tokens = sub_lex.tokenizar()?;
                            // Agregar los tokens (sin Eof) envueltos en paréntesis
                            tokens.push(TokenConPos {
                                token: Token::ParenIzq,
                                linea: self.linea,
                                columna: self.col,
                            });
                            for st in &sub_tokens {
                                if st.token != Token::Eof {
                                    tokens.push(st.clone());
                                }
                            }
                            tokens.push(TokenConPos {
                                token: Token::ParenDer,
                                linea: self.linea,
                                columna: self.col,
                            });

                            // Si sigue más texto o otra interpolación, emitir +
                            if self.pos < self.fuente.len() && self.actual() != '"' {
                                tokens.push(TokenConPos {
                                    token: Token::Mas,
                                    linea: self.linea,
                                    columna: self.col,
                                });
                            }

                            continue;
                        }

                        // ── Escape sequences ──
                        if self.actual() == '\\' && self.pos + 1 < self.fuente.len() {
                            self.avanzar();
                            match self.actual() {
                                'n' => texto.push('\n'),
                                't' => texto.push('\t'),
                                '\\' => texto.push('\\'),
                                '"' => texto.push('"'),
                                '{' => texto.push('{'),  // escape para literal {
                                other => {
                                    texto.push('\\');
                                    texto.push(other);
                                }
                            }
                        } else {
                            texto.push(self.actual());
                        }
                        self.avanzar();
                    }
                    if self.pos >= self.fuente.len() {
                        return Err(format!(
                            "Cadena sin cerrar en línea {}, columna {}",
                            lin, col
                        ));
                    }
                    self.avanzar(); // consumir "

                    // Emitir el texto final (o el texto completo si no hubo interpolación)
                    if !texto.is_empty() || !tiene_interpolacion {
                        tokens.push(TokenConPos {
                            token: Token::Texto(texto),
                            linea: lin,
                            columna: col,
                        });
                    }
                }

                // ── Números ──
                '0'..='9' => {
                    let lin = self.linea;
                    let col = self.col;
                    let inicio = self.pos;
                    while self.pos < self.fuente.len() && self.actual().is_ascii_digit()
                    {
                        self.avanzar();
                    }
                    // ¿Decimal?
                    if self.pos < self.fuente.len()
                        && self.actual() == '.'
                        && self.peek(1).is_some_and(|c| c.is_ascii_digit())
                    {
                        self.avanzar(); // consumir .
                        while self.pos < self.fuente.len()
                            && self.actual().is_ascii_digit()
                        {
                            self.avanzar();
                        }
                        let s: String =
                            self.fuente[inicio..self.pos].iter().collect();
                        let n: f64 = s.parse().map_err(|_| {
                            format!("Decimal inválido '{}' en línea {}", s, lin)
                        })?;
                        tokens.push(TokenConPos {
                            token: Token::Decimal(n),
                            linea: lin,
                            columna: col,
                        });
                    } else {
                        let s: String =
                            self.fuente[inicio..self.pos].iter().collect();
                        let n: i64 = s.parse().map_err(|_| {
                            format!("Entero inválido '{}' en línea {}", s, lin)
                        })?;
                        tokens.push(TokenConPos {
                            token: Token::Entero(n),
                            linea: lin,
                            columna: col,
                        });
                    }
                }

                // ── Operadores de dos caracteres ──
                '=' if self.peek(1) == Some('=') => {
                    tokens.push(self.tok(Token::IgualIgual));
                    self.avanzar_n(2);
                }
                '!' if self.peek(1) == Some('=') => {
                    tokens.push(self.tok(Token::NoIgual));
                    self.avanzar_n(2);
                }
                '>' if self.peek(1) == Some('=') => {
                    tokens.push(self.tok(Token::MayorIgual));
                    self.avanzar_n(2);
                }
                '<' if self.peek(1) == Some('=') => {
                    tokens.push(self.tok(Token::MenorIgual));
                    self.avanzar_n(2);
                }

                // ── Operadores simples ──
                '+' => { tokens.push(self.tok(Token::Mas)); self.avanzar(); }
                '-' => { tokens.push(self.tok(Token::Menos)); self.avanzar(); }
                '*' => { tokens.push(self.tok(Token::Asterisco)); self.avanzar(); }
                '/' => { tokens.push(self.tok(Token::Barra)); self.avanzar(); }
                '%' => { tokens.push(self.tok(Token::Modulo)); self.avanzar(); }
                '=' => { tokens.push(self.tok(Token::Igual)); self.avanzar(); }
                '>' => { tokens.push(self.tok(Token::Mayor)); self.avanzar(); }
                '<' => { tokens.push(self.tok(Token::Menor)); self.avanzar(); }
                '!' => { tokens.push(self.tok(Token::Exclamacion)); self.avanzar(); }

                // ── Delimitadores ──
                '(' => { tokens.push(self.tok(Token::ParenIzq)); self.avanzar(); }
                ')' => { tokens.push(self.tok(Token::ParenDer)); self.avanzar(); }
                '[' => { tokens.push(self.tok(Token::CorcheteIzq)); self.avanzar(); }
                ']' => { tokens.push(self.tok(Token::CorcheteDer)); self.avanzar(); }
                '{' => { tokens.push(self.tok(Token::LlaveIzq)); self.avanzar(); }
                '}' => { tokens.push(self.tok(Token::LlaveDer)); self.avanzar(); }
                ',' => { tokens.push(self.tok(Token::Coma)); self.avanzar(); }
                '.' if self.peek(1) == Some('.') && self.peek(2) == Some('.') => {
                    tokens.push(self.tok(Token::Elipsis));
                    self.avanzar_n(3);
                }
                '.' => { tokens.push(self.tok(Token::Punto)); self.avanzar(); }

                // ── Identificadores y palabras clave ──
                c if c.is_alphabetic() || c == '_' => {
                    let lin = self.linea;
                    let col = self.col;
                    let inicio = self.pos;
                    while self.pos < self.fuente.len()
                        && (self.actual().is_alphanumeric() || self.actual() == '_')
                    {
                        self.avanzar();
                    }
                    let palabra: String =
                        self.fuente[inicio..self.pos].iter().collect();

                    // ── Bit:~ → Superposición cuántica (50/50) ──
                    // ── Bit:[0.85] → Superposición sesgada ──
                    if palabra == "Bit" && self.peek(0) == Some(':') {
                        match self.peek(1) {
                            Some('~') => {
                                self.avanzar_n(2); // consumir :~
                                tokens.push(TokenConPos {
                                    token: Token::BitCuantico,
                                    linea: lin,
                                    columna: col,
                                });
                                continue;
                            }
                            Some('[') => {
                                self.avanzar_n(2); // consumir :[
                                let inicio_num = self.pos;
                                while self.pos < self.fuente.len()
                                    && self.actual() != ']'
                                {
                                    self.avanzar();
                                }
                                if self.pos >= self.fuente.len() {
                                    return Err(format!(
                                        "Bit:[prob] sin cerrar ']' en línea {}, col {}",
                                        lin, col
                                    ));
                                }
                                let num_str: String =
                                    self.fuente[inicio_num..self.pos].iter().collect();
                                self.avanzar(); // consumir ]
                                let prob: f64 = num_str.trim().parse().map_err(|_| {
                                    format!(
                                        "Probabilidad inválida '{}' en Bit:[prob] línea {}",
                                        num_str, lin
                                    )
                                })?;
                                if !(0.0..=1.0).contains(&prob) {
                                    return Err(format!(
                                        "Probabilidad {} fuera de rango [0.0, 1.0] en línea {}",
                                        prob, lin
                                    ));
                                }
                                tokens.push(TokenConPos {
                                    token: Token::BitSesgado(prob),
                                    linea: lin,
                                    columna: col,
                                });
                                continue;
                            }
                            _ => {} // no es quantum, caer al flujo normal
                        }
                    }

                    // Buscar en diccionario de palabras clave
                    let token = if let Some(kw) = self.palabras_clave.get(&palabra) {
                        kw.clone()
                    } else {
                        Token::Ident(palabra)
                    };
                    tokens.push(TokenConPos {
                        token,
                        linea: lin,
                        columna: col,
                    });
                }


                _ => {
                    return Err(format!(
                        "Carácter desconocido '{}' en línea {}, columna {}",
                        c, self.linea, self.col
                    ));
                }
            }
        }

        // Emitir DEDENTs pendientes al final del archivo
        while self.indent_stack.len() > 1 {
            self.indent_stack.pop();
            tokens.push(TokenConPos {
                token: Token::Dedent,
                linea: self.linea,
                columna: self.col,
            });
        }

        tokens.push(TokenConPos {
            token: Token::Eof,
            linea: self.linea,
            columna: self.col,
        });

        Ok(tokens)
    }

    // ─── Indentación (estilo Python estricto) ────────────────────────────────

    fn procesar_indentacion(
        &mut self,
        tokens: &mut Vec<TokenConPos>,
    ) -> Result<(), String> {
        let mut espacios: usize = 0;
        while self.pos < self.fuente.len() {
            match self.actual() {
                ' ' => {
                    espacios += 1;
                    self.avanzar();
                }
                '\t' => {
                    espacios += 4;
                    self.avanzar();
                }
                '\n' | '\r' => return Ok(()), // línea vacía
                _ => break,
            }
        }

        if self.pos >= self.fuente.len() {
            return Ok(());
        }

        // Comentarios no afectan indentación
        if self.actual() == ':' && self.peek(1) == Some('@') {
            return Ok(());
        }

        let nivel_actual = *self.indent_stack.last().unwrap();

        if espacios > nivel_actual {
            self.indent_stack.push(espacios);
            tokens.push(TokenConPos {
                token: Token::Indent,
                linea: self.linea,
                columna: 1,
            });
        } else {
            while self.indent_stack.len() > 1
                && espacios < *self.indent_stack.last().unwrap()
            {
                self.indent_stack.pop();
                tokens.push(TokenConPos {
                    token: Token::Dedent,
                    linea: self.linea,
                    columna: 1,
                });
            }
            if espacios != *self.indent_stack.last().unwrap() {
                return Err(format!(
                    "Indentación inconsistente en línea {} \
                     (esperaba {} espacios, encontró {})",
                    self.linea,
                    self.indent_stack.last().unwrap(),
                    espacios
                ));
            }
        }
        Ok(())
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    fn actual(&self) -> char {
        self.fuente[self.pos]
    }

    fn avanzar(&mut self) {
        self.pos += 1;
        self.col += 1;
    }

    fn avanzar_n(&mut self, n: usize) {
        for _ in 0..n {
            self.avanzar();
        }
    }

    fn peek(&self, offset: usize) -> Option<char> {
        self.fuente.get(self.pos + offset).copied()
    }

    fn tok(&self, token: Token) -> TokenConPos {
        TokenConPos {
            token,
            linea: self.linea,
            columna: self.col,
        }
    }

    fn consumir_newline(&mut self, tokens: &mut Vec<TokenConPos>) {
        tokens.push(self.tok(Token::NuevaLinea));
        if self.actual() == '\r' {
            self.avanzar();
            if self.pos < self.fuente.len() && self.actual() == '\n' {
                self.avanzar();
            }
        } else {
            self.avanzar();
        }
        self.linea += 1;
        self.col = 1;
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hola_mundo() {
        let mut lexer = Lexer::nuevo("mostrar \"Hola, Mundo!\"", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::Mostrar);
        assert_eq!(
            tokens[1].token,
            Token::Texto("Hola, Mundo!".to_string())
        );
    }

    #[test]
    fn test_caritas_moset() {
        let mut lexer = Lexer::nuevo(":,] :,[ :,\\ :@comentario", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::FuncDef);
        assert_eq!(tokens[1].token, Token::CatchDef);
        assert_eq!(tokens[2].token, Token::Esperar);
        assert!(matches!(tokens[3].token, Token::Comentario(_)));
    }

    #[test]
    fn test_variable_y_numero() {
        let mut lexer = Lexer::nuevo("edad = 25", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::Ident("edad".to_string()));
        assert_eq!(tokens[1].token, Token::Igual);
        assert_eq!(tokens[2].token, Token::Entero(25));
    }

    #[test]
    fn test_condicional_inline() {
        let mut lexer =
            Lexer::nuevo("si saldo > 0: \"Aprobado\" sino: \"Rechazado\"", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::Si);
        assert_eq!(tokens[1].token, Token::Ident("saldo".to_string()));
        assert_eq!(tokens[2].token, Token::Mayor);
        assert_eq!(tokens[3].token, Token::Entero(0));
        assert_eq!(tokens[4].token, Token::DosPuntos);
    }

    #[test]
    fn test_idioma_ingles() {
        let mut lexer = Lexer::nuevo("if x > 0: show \"yes\"", Some("en"));
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::Si); // "if" → Token::Si
        assert_eq!(tokens[4].token, Token::DosPuntos);
        assert_eq!(tokens[5].token, Token::Mostrar); // "show" → Token::Mostrar
    }

    #[test]
    fn test_bit_sesgado() {
        let mut lexer = Lexer::nuevo("x = Bit:[0.85]", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::Ident("x".to_string()));
        assert_eq!(tokens[1].token, Token::Igual);
        assert_eq!(tokens[2].token, Token::BitSesgado(0.85));
    }

    #[test]
    fn test_bit_sesgado_cero() {
        let mut lexer = Lexer::nuevo("Bit:[0.0]", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::BitSesgado(0.0));
    }

    #[test]
    fn test_bit_sesgado_uno() {
        let mut lexer = Lexer::nuevo("Bit:[1.0]", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::BitSesgado(1.0));
    }

    #[test]
    fn test_bit_sesgado_rango_invalido() {
        let mut lexer = Lexer::nuevo("Bit:[1.5]", None);
        assert!(lexer.tokenizar().is_err());
    }

    #[test]
    fn test_bit_sesgado_sin_cerrar() {
        let mut lexer = Lexer::nuevo("Bit:[0.5", None);
        assert!(lexer.tokenizar().is_err());
    }

    #[test]
    fn test_elipsis() {
        let mut lexer = Lexer::nuevo("...", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::Elipsis);
    }

    #[test]
    fn test_punto_vs_elipsis() {
        let mut lexer = Lexer::nuevo("a.b", None);
        let tokens = lexer.tokenizar().unwrap();
        assert_eq!(tokens[0].token, Token::Ident("a".into()));
        assert_eq!(tokens[1].token, Token::Punto);
        assert_eq!(tokens[2].token, Token::Ident("b".into()));
    }

    // ─── FASE E: STRING INTERPOLATION ───────────────────────────────────

    #[test]
    fn test_interpolacion_tokens() {
        // "Hola {nombre}" debe generar: Texto("Hola ") Mas ParenIzq Ident("nombre") ParenDer
        let mut lexer = Lexer::nuevo("\"Hola {nombre}\"", None);
        let tokens = lexer.tokenizar().unwrap();
        // Filter out Eof and NuevaLinea for clarity
        let filtered: Vec<_> = tokens.iter()
            .filter(|t| t.token != Token::Eof && t.token != Token::NuevaLinea)
            .collect();
        assert_eq!(filtered[0].token, Token::Texto("Hola ".to_string()));
        assert_eq!(filtered[1].token, Token::Mas);
        assert_eq!(filtered[2].token, Token::ParenIzq);
        assert_eq!(filtered[3].token, Token::Ident("nombre".to_string()));
        assert_eq!(filtered[4].token, Token::ParenDer);
    }

    #[test]
    fn test_interpolacion_sin_interpol() {
        // String sin { } debe seguir funcionando igual
        let mut lexer = Lexer::nuevo("\"Hola mundo\"", None);
        let tokens = lexer.tokenizar().unwrap();
        let filtered: Vec<_> = tokens.iter()
            .filter(|t| t.token != Token::Eof && t.token != Token::NuevaLinea)
            .collect();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].token, Token::Texto("Hola mundo".to_string()));
    }

    #[test]
    fn test_interpolacion_escape_llave() {
        // Escaped \{ should produce literal {
        let mut lexer = Lexer::nuevo("\"precio: \\{100}\"", None);
        let tokens = lexer.tokenizar().unwrap();
        let filtered: Vec<_> = tokens.iter()
            .filter(|t| t.token != Token::Eof && t.token != Token::NuevaLinea)
            .collect();
        // The \{ is escaped, so the whole string is literal
        assert_eq!(filtered[0].token, Token::Texto("precio: {100}".to_string()));
    }
}
