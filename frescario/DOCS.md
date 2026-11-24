# Frescario

Gestión de la despensa, la nevera, el congelador y la lista de la compra de casa, dentro de Home Assistant.

## Cómo se entra

Después de instalarlo y arrancarlo, aparece **Frescario** en la barra lateral de Home Assistant. Cada persona entra con su propio usuario de Home Assistant, así que no hay contraseñas nuevas.

Para usar la cámara (códigos de barras y tickets), entra siempre a Home Assistant por su dirección segura (https).

## Configuración del complemento

```yaml
administradores:
  - tu_usuario
lista_ha: todo.lista_de_la_compra
gemini_api_key: tu_clave
```

- **administradores**: nombres de usuario de Home Assistant que serán administradores. Si lo dejas vacío, la primera persona que entre lo será.
- **lista_ha**: lista de tareas de Home Assistant que se sincroniza con la lista de la compra de Frescario. Sirve para añadir cosas por voz con tu asistente. Déjalo vacío si no la quieres.
- **gemini_api_key**: clave de Google Gemini para leer las fotos de los tickets del súper. Sin ella, todo lo demás funciona igual.

## Permisos

Desde **Ajustes** dentro de Frescario, el administrador decide qué puede hacer cada persona:

- **Administrador**: todo, incluidos almacenes, categorías, avisos y permisos.
- **Familia**: añadir, consumir, editar productos y usar la lista de la compra.
- **Solo consulta**: puede mirarlo todo, pero no cambiar nada.

## Avisos al móvil

Cada persona elige en **Ajustes, Mis avisos** a qué móvil le llegan (los que tienen la app de Home Assistant) y de qué quiere enterarse: caducidades del día, productos que bajan de su mínimo y cosas nuevas en la lista. El administrador elige la hora del aviso diario y con cuántos días de antelación se avisa.

## Sensores

Frescario crea en Home Assistant estos sensores para paneles y automatizaciones:

- `sensor.frescario_caducan_hoy`
- `sensor.frescario_caducan_manana`
- `sensor.frescario_caducan_semana`
- `sensor.frescario_caducados`
- `sensor.frescario_bajo_minimo`
- `sensor.frescario_lista_compra`

Cada uno tiene el número de productos y, en sus atributos, la lista de nombres.

## Los datos

Todo se guarda dentro del complemento y entra en las copias de seguridad normales de Home Assistant. Desde Ajustes también puedes descargar o restaurar una copia.
