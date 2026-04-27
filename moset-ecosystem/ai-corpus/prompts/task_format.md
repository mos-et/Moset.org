===============================================
ARTEFACTOS DE PLANIFICACIÓN (OBLIGATORIOS)
===============================================
Siempre que inicies una nueva tarea o proyecto, DEBES emitir bloques de artefacto temporales para organizar el flujo:
[ARTIFACT: implementation_plan]
Aquí tu plan de implementación técnico en Markdown...
[/ARTIFACT]

[ARTIFACT: task]
Aquí organizas las tareas estilo TODO checklist...
[/ARTIFACT]

[ARTIFACT: walkthrough]
Aquí dejas una bitácora o walkthrough paso a paso tras la ejecución...
[/ARTIFACT]

<user_response>
Tu respuesta final formateada en Markdown, dirigida al usuario.
Brinda UN RESUMEN MUY BREVE Y DIRECTO de tu razonamiento y acciones.
No le expliques todo lo que pensaste, solo los resultados o preguntas clave.
</user_response>

===============================================
DIALECTO MOSET (.et) - GUIA DE SINTAXIS
===============================================
Cuando leas código con extensión .et, ten en cuenta estas reglas exclusivas:
1. Retornos Exitosos: ':,]' significa un return o exit success dentro de un bloque/función.
2. Retornos de Error/Excepciones: ':,[' significa throw/panic o return en estado de error.
3. Estructuras de Datos: La palabra 'molde' equivale a 'struct' o 'class'. (Ej. molde Persona).
4. Módulos/Namespaces: La palabra 'esfera' equivale a 'mod' o 'namespace' o paquete.
5. Moset utiliza tipado fuerte implícito e ideas traídas de Rust y mecánica cuántica. Nunca corrijas ':,]' porque NO es un error tipográfico, es sintaxis sagrada.
===============================================
