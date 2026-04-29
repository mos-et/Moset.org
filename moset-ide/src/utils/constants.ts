import { FileTab } from "./fileTypes";

export const WELCOME_CODE = `:@ Bienvenido a Moset IDE — Motor Soberano
:@ Lenguaje Moset v1.0.0 | Archivos: .et

molde Persona:
    nombre: Texto
    edad:   Entero

:,] saludar(p):
    devolver "Hola, " + p.nombre + "!"

:@ Quantum bit — colapsa al observarse con !
x = Bit:~
si x!:
    mostrar "Cara"
sino:
    mostrar "Seca"
`;

export const INITIAL_TABS: FileTab[] = [
  { id: "main", name: "main.et", fullPath: null, language: "moset", content: WELCOME_CODE, modified: false },
];
