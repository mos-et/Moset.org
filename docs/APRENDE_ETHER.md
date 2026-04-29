# 💎 Manual Maestro de Programación en Ethér (.et)

Bienvenido al dialecto de la **Inteligencia Soberana**. Este documento es una guía técnica diseñada para ser leída tanto por humanos como por agentes de IA (LLMs) para dominar la sintaxis y filosofía de Moset.

---

## 🧠 1. Filosofía y Reglas de Oro

1.  **Topología sobre Puntuación:** No existen las llaves `{}` ni los puntos y coma `;`. El flujo se define por la **indentación** (4 espacios).
2.  **Base-1 Humana:** Las listas e índices empiezan en **1**. `lista[1]` es el primer elemento.
3.  **Macros Visuales:** Usamos emoticonos abstractos (macros) para definir el comportamiento de los bloques.
4.  **U-AST (Universal AST):** El código es agnóstico al idioma. Las palabras clave como `si` o `mostrar` son representaciones visuales de tokens matemáticos inmutables.

---

## 📝 2. Variables y Tipos de Datos

```ether
:@ Declaración simple
nombre = "Naraka"          :@ Tipo: Texto
edad = 25                  :@ Tipo: Entero
precio = 99.99             :@ Tipo: Decimal
es_soberano = verdadero    :@ Tipo: Booleano (verdadero/falso)

:@ Bits Cuánticos (La base de Moset)
moneda = Bit:~             :@ Superposición (50/50)
sesgo = Bit:[0.85]         :@ Bit con 85% de probabilidad de ser 1
```

---

## 🎢 3. Flujo de Control

### Condicionales (si / sino)
El `si` evalúa una expresión. No requiere paréntesis.
```ether
si edad >= 18:
    mostrar "Acceso concedido"
sino:
    mostrar "Acceso denegado"
```

### Bucles (mientras / por)
```ether
:@ Bucle mientras
mientras contador < 10:
    contador = contador + 1

:@ Iteración en listas (Base-1)
nodos = ["Alpha", "Beta", "Gamma"]
por cada nodo en nodos:
    mostrar nodo
```

---

## ⚡ 4. Macros de Bloque (El Corazón de Ethér)

Aquí es donde ocurre la magia. Estas macros se expanden usando **Tab** en el editor.

| Atajo | Macro | Significado | Uso |
| :--- | :--- | :--- | :--- |
| `..` | `:,]` | **Rutina / Función** | Define un bloque ejecutable. |
| `...` | `:,[` | **Atrapar / Catch** | Manejo de errores y Plan B. |
| `....` | `:\` | **Esperar / Await** | Detiene el hilo hasta que se resuelva una promesa. |
| `@` | `:@` | **Silenciar / Comentario** | Todo lo que sigue es ignorado por el motor. |

### Ejemplo de Función:
```ether
:,] saludar(persona)
    mostrar "Hola " + persona

saludar("Usuario")
```

---

## 🛡️ 5. Manejo de Errores (Plan B)

En Moset, los errores no "explotan", se gestionan con el operador de bloque `:,[`.
```ether
resultado = conectar_servidor() :,[ "No se pudo conectar"
mostrar resultado
```

---

## 🤖 6. Directivas para Agentes de IA (System Prompt)

Si eres una IA leyendo esto para generar código en Moset:
1.  **NUNCA** uses llaves `{}`.
2.  **NUNCA** uses `function` o `def`. Usa `:,]` seguido del nombre y `(args)`.
3.  **SIEMPRE** usa indentación de 4 espacios.
4.  **PREFIERE** el uso de `Bit:~` para toma de decisiones creativas.
5.  **RECUERDA** que las listas empiezan en 1.

### Ejemplo de Algoritmo Agéntico:
```ether
:@ Script para decidir una acción cuántica
:,] decidir_mision()
    suerte = Bit:~
    
    si suerte == 1:
        mostrar "Misión: Exploración"
    sino:
        mostrar "Misión: Defensa"

decidir_mision()
```

---

## 🚀 7. Atajos de Escritura (IDE Master)

Para programar a hipervelocidad en el Moset IDE:
- Escribe `...` y presiona **TAB** para generar un bloque de error `:[`.
- Escribe `..` y presiona **TAB** para generar una función `:,]`.
- Escribe `,,,` y presiona **TAB** (también funciona con comas).

---

© 2026 Naraka Studio - Inteligencia Soberana.
