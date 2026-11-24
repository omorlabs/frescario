# Frescario

Gestión de la despensa, la nevera, el congelador y la lista de la compra de casa, dentro de Home Assistant.

## Cómo se entra

Después de instalarlo y arrancarlo, aparece **Frescario** en la barra lateral de Home Assistant. Cada persona entra con su propio usuario de Home Assistant, así que no hay contraseñas nuevas.

## Administradores

La primera persona que abre Frescario se convierte en administrador. Si quieres fijar tú quién lo es, escribe su nombre de usuario de Home Assistant en la pestaña **Configuración** de este complemento:

```yaml
administradores:
  - oscar
```

Desde **Ajustes** dentro de Frescario, el administrador decide qué puede hacer cada persona:

- **Administrador**: todo, incluidos almacenes, categorías, avisos y permisos.
- **Familia**: añadir, consumir, editar productos y usar la lista de la compra.
- **Solo consulta**: puede mirarlo todo, pero no cambiar nada.

## Los datos

Todo se guarda dentro del complemento y entra en las copias de seguridad normales de Home Assistant.

## Escáner

Para usar la cámara (llegará en una próxima versión), entra a Home Assistant siempre por su dirección HTTPS.
