use moset_core::compiler::Compilador;
use moset_core::vm::engine::VM;
use moset_core::parser::Parser;
use moset_core::lexer::Lexer;

#[test]
fn test_integracion_completa_e2e() {
    let codigo = "a = 10\nb = 5\nz = a + b\nmostrar z\n";
    
    let mut lexer = Lexer::nuevo(codigo, None);
    let tokens = lexer.tokenizar().expect("Error al tokenizar el script");
    
    let mut parser = Parser::nuevo(tokens);
    let statements = parser.parsear().expect("Error al parsear el script E2E");
    
    let mut compilador = Compilador::nuevo();
    compilador.compilar_programa(&statements).expect("Error al compilar el script E2E");
    let chunk = compilador.chunk;
    
    let mut vm = VM::nueva(chunk);
    let resultado = vm.ejecutar();
    
    assert!(resultado.is_ok(), "La ejecución de la VM falló: {:?}", resultado);
}

#[test]
fn test_e2e_catch_en_linea() {
    let codigo = "res = peticion_get(\"http://url-invalida-que-no-existe-moset.com\") :,[ \"Error Atrapado\"\n";
    
    let mut lexer = Lexer::nuevo(codigo, None);
    let tokens = lexer.tokenizar().expect("Error al tokenizar");
    let mut parser = Parser::nuevo(tokens);
    let statements = parser.parsear().expect("Error al parsear");
    
    let mut compilador = Compilador::nuevo();
    compilador.compilar_programa(&statements).expect("Error al compilar");
    let chunk = compilador.chunk;
    
    let mut vm = VM::nueva(chunk.clone());
    let resultado = vm.ejecutar();
    
    assert!(resultado.is_ok(), "La VM falló en lugar de atrapar el error: {:?}", resultado);
    
    let val_res = vm.globales.get("res").expect("Variable 'res' no definida");
    if let moset_core::valor::Valor::Texto(msg) = val_res {
        assert_eq!(msg, "Error Atrapado");
    } else {
        panic!("El valor de res no es texto");
    }
}

#[test]
fn test_e2e_sandbox_rejection() {
    // Al intentar leer una ruta absoluta prohibida, el vigilante lanzará un Err,
    // y el catch en línea lo atrapará.
    let codigo = "res = leer(\"/etc/shadow\") :,[ \"Acceso Denegado\"\n";
    
    let mut lexer = Lexer::nuevo(codigo, None);
    let tokens = lexer.tokenizar().expect("Error al tokenizar");
    let mut parser = Parser::nuevo(tokens);
    let statements = parser.parsear().expect("Error al parsear");
    
    let mut compilador = Compilador::nuevo();
    compilador.compilar_programa(&statements).expect("Error al compilar");
    let chunk = compilador.chunk;
    
    let mut vm = VM::nueva(chunk);
    let resultado = vm.ejecutar();
    
    assert!(resultado.is_ok(), "La VM falló en lugar de atrapar el error del Sandbox: {:?}", resultado);
    
    let val_res = vm.globales.get("res").expect("Variable 'res' no definida");
    if let moset_core::valor::Valor::Texto(msg) = val_res {
        assert_eq!(msg, "Acceso Denegado");
    } else {
        panic!("El valor de res no es texto");
    }
}

#[test]
fn test_e2e_closure_captura() {
    let codigo = ":,] creador()
    x = 42
    c = :,) ()
        devolver x
    devolver c
closure = creador()
res = closure()
";
    
    let mut lexer = Lexer::nuevo(codigo, None);
    let tokens = lexer.tokenizar().expect("Error al tokenizar");
    let mut parser = Parser::nuevo(tokens);
    let statements = parser.parsear().expect("Error al parsear");
    
    let mut compilador = Compilador::nuevo();
    compilador.compilar_programa(&statements).expect("Error al compilar");
    let chunk = compilador.chunk;
    
    let mut vm = VM::nueva(chunk);
    let resultado = vm.ejecutar();
    
    assert!(resultado.is_ok(), "La VM falló al ejecutar closure: {:?}", resultado);
    
    let val_res = vm.globales.get("res").expect("Variable 'res' no definida");
    if let moset_core::valor::Valor::Entero(v) = val_res {
        assert_eq!(*v, 42);
    } else {
        panic!("El valor devuelto por el closure no es el entero esperado");
    }
}

#[test]
fn test_e2e_limite_instrucciones() {
    let codigo = "a = 0
mientras a < 10000000:
    a = a + 1
";
    let mut lexer = Lexer::nuevo(codigo, None);
    let tokens = lexer.tokenizar().expect("Error al tokenizar");
    let mut parser = Parser::nuevo(tokens);
    let statements = parser.parsear().expect("Error al parsear");
    
    let mut compilador = Compilador::nuevo();
    compilador.compilar_programa(&statements).expect("Error al compilar");
    
    let mut vm = VM::nueva(compilador.chunk);
    let resultado = vm.ejecutar();
    
    assert!(resultado.is_err(), "La VM debería haber fallado por límite de instrucciones");
    if let Err(e) = resultado {
        assert!(e.contains("Límite de ejecución excedido"), "El error no es por límite de instrucciones: {}", e);
    }
}
