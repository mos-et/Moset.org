use crate::valor::Valor;

/// Representa el conjunto de instrucciones (Bytecode) que la MV entiende.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum OpCode {
    /// Retorna de la función actual o finaliza la ejecución
    Retorno = 0,
    /// Carga una constante en el tope de la pila
    Constante = 1,
    /// Operaciones aritméticas
    Suma = 2,
    Resta = 3,
    Multiplicacion = 4,
    Division = 5,
    /// Negación numérica (-)
    Negacion = 6,
    /// Booleanos y Nulos
    Verdadero = 7,
    Falso = 8,
    Nulo = 9,
    /// Lógica
    No = 10,
    Igual = 11,
    Mayor = 12,
    Menor = 13,
    /// Imprimir (para debug y la consola)
    Imprimir = 14,
    /// Termina el bloque y limpia variables locales
    Pop = 15,

    // ─── Variables Globales ──────────────────────────────────────────────
    /// Define una variable global (operando: u8 índice del nombre en constantes)
    DefinirGlobal = 16,
    /// Obtiene el valor de una variable global
    ObtenerGlobal = 17,
    /// Asigna un nuevo valor a una variable global existente
    AsignarGlobal = 18,

    // ─── Variables Locales ──────────────────────────────────────────────
    /// Lee una variable local por su slot en la pila
    ObtenerLocal = 19,
    /// Escribe una variable local por su slot en la pila
    AsignarLocal = 20,

    // ─── Control de Flujo ────────────────────────────────────────────────
    /// Salto incondicional (operando: u16 offset hacia adelante)
    Salto = 21,
    /// Salto condicional: salta si el tope de la pila es falso
    SaltoSiFalso = 22,
    /// Bucle: salto hacia atrás (operando: u16 offset)
    Bucle = 23,

    // ─── Funciones ──────────────────────────────────────────────────────
    /// Llamada a función (operando: u8 cantidad de argumentos)
    Llamar = 24,

    // ─── Comparaciones extendidas ───────────────────────────────────────
    MayorIgual = 25,
    MenorIgual = 26,
    NoIgual = 27,

    // ─── Operadores lógicos ─────────────────────────────────────────────
    Modulo = 28,

    // ─── Concatenación de texto ─────────────────────────────────────────
    Concatenar = 29,

    // ─── Quantum ────────────────────────────────────────────────────────
    /// Colapsa un Valor::Superposicion en Valor::Booleano
    ColapsarQuantum = 30,
    /// Crea un Qubit en superposición. Operand: ninguno (los valores alpha y beta van embebidos o los cargamos de la pila, pero como es f64 no cabe en u8).
    /// Espera en la pila: alpha (Decimal), beta (Decimal)
    CrearQubit = 47,

    // ─── Listas ─────────────────────────────────────────────────────────
    /// Construye una lista. Operando: u16 cantidad de elementos en la pila
    ConstruirLista = 31,

    // ─── Campos (Moldes) ────────────────────────────────────────────────
    /// Obtiene un campo de un Molde. Operando: u8 índice del nombre en constantes
    ObtenerCampo = 32,
    /// Asigna un campo de un Molde. Operando: u8 índice del nombre en constantes
    AsignarCampo = 33,

    // ─── Builtins ───────────────────────────────────────────────────────
    /// Llama una función builtin de la stdlib. Operando: u8 nombre_idx, u8 arg_count
    LlamarBuiltin = 34,

    // ─── Colecciones y Diccionarios ─────────────────────────────────────
    ObtenerIndice = 35,
    ObtenerLongitud = 36,

    // ─── Control de Errores ─────────────────────────────────────────────
    ConfigurarCatch = 37,
    LimpiarCatch = 38,
    LanzarError = 39,

    // ─── Asincronía ─────────────────────────────────────────────────────
    Esperar = 40,

    // ─── Closures ───────────────────────────────────────────────────────
    ConstruirClosure = 41,
    ObtenerCaptura = 42,

    // ─── Phase G (Memory & Objects) ─────────────────────────────────────
    AsignarIndice = 43,
    ConstruirMolde = 44,

    // ─── Phase H (Methods & OOP) ────────────────────────────────────────
    /// Invoca un método sobre un objeto. Operando: u8 arg_count
    /// Asume objeto luego metodo en forma de closure u objeto callable
    InvocacionMetodo = 45,
    /// Obtiene la referencia `este` del CallFrame actual
    ObtenerEste = 46,

    // ─── Phase J (Shadow Environments) ──────────────────────────────────
    EntrarPensar = 48,
    SalirPensar = 49,

    // ─── Control de errores internos ────────────────────────────────────
    Invalido = 255,
}

impl From<u8> for OpCode {
    fn from(byte: u8) -> Self {
        match byte {
            0 => OpCode::Retorno,
            1 => OpCode::Constante,
            2 => OpCode::Suma,
            3 => OpCode::Resta,
            4 => OpCode::Multiplicacion,
            5 => OpCode::Division,
            6 => OpCode::Negacion,
            7 => OpCode::Verdadero,
            8 => OpCode::Falso,
            9 => OpCode::Nulo,
            10 => OpCode::No,
            11 => OpCode::Igual,
            12 => OpCode::Mayor,
            13 => OpCode::Menor,
            14 => OpCode::Imprimir,
            15 => OpCode::Pop,
            16 => OpCode::DefinirGlobal,
            17 => OpCode::ObtenerGlobal,
            18 => OpCode::AsignarGlobal,
            19 => OpCode::ObtenerLocal,
            20 => OpCode::AsignarLocal,
            21 => OpCode::Salto,
            22 => OpCode::SaltoSiFalso,
            23 => OpCode::Bucle,
            24 => OpCode::Llamar,
            25 => OpCode::MayorIgual,
            26 => OpCode::MenorIgual,
            27 => OpCode::NoIgual,
            28 => OpCode::Modulo,
            29 => OpCode::Concatenar,
            30 => OpCode::ColapsarQuantum,
            31 => OpCode::ConstruirLista,
            32 => OpCode::ObtenerCampo,
            33 => OpCode::AsignarCampo,
            34 => OpCode::LlamarBuiltin,
            35 => OpCode::ObtenerIndice,
            36 => OpCode::ObtenerLongitud,
            37 => OpCode::ConfigurarCatch,
            38 => OpCode::LimpiarCatch,
            39 => OpCode::LanzarError,
            40 => OpCode::Esperar,
            41 => OpCode::ConstruirClosure,
            42 => OpCode::ObtenerCaptura,
            43 => OpCode::AsignarIndice,
            44 => OpCode::ConstruirMolde,
            45 => OpCode::InvocacionMetodo,
            46 => OpCode::ObtenerEste,
            47 => OpCode::CrearQubit,
            48 => OpCode::EntrarPensar,
            49 => OpCode::SalirPensar,
            _ => OpCode::Invalido,
        }
    }
}

/// Un "Chunk" de bytecode representa una secuencia continua de instrucciones.
#[derive(Debug, Clone)]
pub struct Chunk {
    pub codigo: Vec<u8>,
    pub constantes: Vec<Valor>, // Pool de constantes numéricas/cadenas
    pub lineas: Vec<usize>,     // Para rastreo y errores
}

impl Default for Chunk {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl Chunk {
    pub fn nuevo() -> Self {
        Self {
            codigo: Vec::new(),
            constantes: Vec::new(),
            lineas: Vec::new(),
        }
    }

    /// Escribe una instrucción o byte en el chunk (opcodes o índices)
    pub fn escribir(&mut self, byte: u8, linea: usize) {
        self.codigo.push(byte);
        self.lineas.push(linea);
    }

    /// Añade una constante al pool y devuelve su índice
    pub fn añadir_constante(&mut self, valor: Valor) -> Result<usize, String> {
        if self.constantes.len() >= u16::MAX as usize {
            return Err("Demasiadas constantes en un mismo bloque (límite: 65535)".to_string());
        }
        self.constantes.push(valor);
        Ok(self.constantes.len() - 1)
    }

    /// Escribe un salto placeholder y retorna el offset para backpatching
    pub fn emitir_salto(&mut self, opcode: OpCode, linea: usize) -> usize {
        self.escribir(opcode as u8, linea);
        // Placeholder de 2 bytes para el offset (u16 big-endian)
        self.escribir(0xFF, linea);
        self.escribir(0xFF, linea);
        self.codigo.len() - 2 // offset del primer byte del placeholder
    }

    /// Parchea un salto previo con el offset real
    pub fn parchear_salto(&mut self, offset: usize) -> Result<(), String> {
        let salto = self.codigo.len() - offset - 2;
        if salto > u16::MAX as usize {
            return Err("Salto demasiado grande para u16".to_string());
        }
        self.codigo[offset] = (salto & 0xFF) as u8;
        self.codigo[offset + 1] = ((salto >> 8) & 0xFF) as u8;
        Ok(())
    }

    /// Emite un bucle (salto hacia atrás)
    pub fn emitir_bucle(&mut self, inicio_loop: usize, linea: usize) -> Result<(), String> {
        self.escribir(OpCode::Bucle as u8, linea);
        // +2 por los bytes del operando que vamos a escribir
        let offset = self.codigo.len() - inicio_loop + 2;
        if offset > u16::MAX as usize {
            return Err("Bucle demasiado grande para u16".to_string());
        }
        self.escribir((offset & 0xFF) as u8, linea);
        self.escribir(((offset >> 8) & 0xFF) as u8, linea);
        Ok(())
    }
}
