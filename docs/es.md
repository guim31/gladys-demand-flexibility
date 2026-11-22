# NESO Demand Flexibility

Los eventos del **Demand Flexibility Service** (DFS) de NESO, el operador del
sistema eléctrico británico: medias horas en las que los hogares y empresas
inscritos a través de su proveedor («Saving Sessions» de Octopus, entre otros)
reciben dinero por modificar su consumo. Los datos proceden del
[portal de datos abiertos de NESO](https://www.neso.energy/data-portal/demand-flexibility).
Esta integración no tiene relación con NESO ni con ningún proveedor.

## Presentación

NESO publica dos tipos de eventos, cada uno seguido como un dispositivo:

- **reducción** («reducir»): consumir menos durante el evento — los más
  habituales, detrás de las «saving sessions»;
- **aumento** («aumentar»): consumir más, cuando la red tiene demasiada
  electricidad (más raros).

Los eventos se anuncian el mismo día, normalmente entre las 10 y las 13 h,
para la tarde y la noche (por ejemplo 16:00–20:00). Cada dispositivo indica si
hay un evento en curso, el próximo y cuántos hay anunciados. Un widget, tres
disparadores de escena y una acción de escena ayudan a desplazar la lavadora,
la carga del coche o la calefacción.

Que **su** hogar cobre depende de su proveedor y de su inscripción al evento
con él: la integración solo indica lo que NESO ha pedido.

## Requisitos

- Gladys Assistant 5.3.0 o posterior.
- Gladys debe alcanzar `api.neso.energy` en Internet. Sin cuenta ni clave: los
  datos son abiertos, bajo la NESO Open Data Licence.
- El servicio cubre Gran Bretaña (Inglaterra, Escocia, Gales).

## Configuración

1. Instale la integración (**Integraciones → Instalar desde GitHub**, luego
   `https://github.com/guim31/gladys-demand-flexibility`).
2. En su pestaña **Configuración**:
   - **Idioma de los nombres**: idioma de los nombres de dispositivos y
     funciones (fijados al añadir un dispositivo) y de los textos enviados a
     las escenas;
   - **Eventos para consumir menos**: activado por defecto;
   - **Eventos para consumir más**: desactivado por defecto.
3. Guarde y añada los dispositivos desde la pestaña **Descubrimiento**.

### Botón «Probar la conexión»

Lee al momento el portal de NESO y muestra cuántos eventos hay anunciados y el
próximo, o el error en rojo.

## Dispositivos

### Flexibilidad DFS (uno por tipo de evento)

| Función                    | Valor                                                     |
| -------------------------- | --------------------------------------------------------- |
| Evento en curso            | 1 durante un evento, 0 si no                              |
| Eventos próximos           | eventos anunciados y aún no empezados                     |
| Inicio del próximo evento  | día y hora, por ejemplo `sáb, 21/11 16:00`, o «ninguno»   |
| Fin del próximo evento     | hora, por ejemplo `20:00`                                 |
| Precio garantizado (£/MWh) | el precio de aceptación garantizado por NESO, 0 si no hay |

El «próximo evento» es el evento en curso o, si no, el siguiente. NESO rara vez
fija un precio garantizado; lo que paga su proveedor no se publica.

## Widget

**Próximo evento DFS** muestra, para el tipo elegido en sus ajustes (el
primero por defecto): el evento en curso y su fin, o el próximo y el tiempo
hasta su inicio, el precio garantizado si existe, los demás eventos próximos y
el último terminado. Dos ajustes ocultan los eventos próximos y el último.

## Escenas

### Nuevo evento anunciado (disparador)

Se activa cuando NESO publica un evento no visto antes. Filtro: el tipo de
evento. Variables: `day`, `start_time`, `end_time`, `duration_minutes`,
`minutes_until`, `price`. Los eventos ya publicados en el primer arranque de la
integración no lo activan.

### El evento empieza pronto (disparador)

Se activa una vez por evento y por plazo elegido: 5, 15, 30 minutos, 1 o 2
horas antes de su inicio. Un evento anunciado tarde activa de golpe los plazos
ya pasados. Filtros: el tipo de evento, los plazos. Variables: `start_time`,
`end_time`, `duration_minutes`, `minutes_until`, `price`.

### Evento terminado (disparador)

Se activa una vez al final de cada evento (en las dos horas siguientes).
Filtro: el tipo de evento. Variables: `start_time`, `end_time`,
`duration_minutes`.

### Obtener el próximo evento (acción)

Devuelve el evento en curso o el próximo para las acciones siguientes: `day`,
`start_time`, `end_time`, `minutes_until`, `duration_minutes`, `in_progress`
(1 o 0) y `price`. Falla, en rojo, si no hay ningún evento anunciado.

## Ejemplos de escenas

- **Nuevo evento anunciado** → enviarse «Saving session hoy:» seguido de
  `start_time` y `end_time`, elegidos en la lista de variables.
- **El evento empieza pronto** (30 minutos) → apagar el termo y bajar la
  consigna de la calefacción; **Evento terminado** → restablecerlos.
- **El evento empieza pronto** en los eventos de aumento → iniciar la carga
  del coche eléctrico.

## Límites

- La integración lee el portal cada 10 minutos (una consulta pequeña), solo si
  hay un dispositivo añadido o el widget está a la vista. NESO pide como mucho
  1 petición por segundo a su API y 2 por minuto a su datastore: muy por encima
  de este uso.
- NESO publica también raros eventos de prueba (una hora aproximadamente, pocos
  al año): se muestran y activan las escenas como los demás.
- NESO publica los eventos previstos; puede anular o cambiar uno, lo que
  muestra la lectura siguiente.
- Si el portal no está disponible, los dispositivos conservan los últimos
  eventos leídos (un evento empieza y termina igualmente a su hora), y la
  pantalla de configuración lo indica.
- Las horas se muestran en la zona horaria de Gladys.
- Desarrollada y probada contra el portal real de NESO, todavía no en un hogar
  que participe en el servicio: sus comentarios son bienvenidos.

## Solución de problemas

- **Ningún dispositivo en Descubrimiento**: no se sigue ningún tipo de evento;
  marque uno en la configuración.
- **«El portal de datos de NESO no está disponible»**: compruebe el acceso a
  Internet de Gladys y use **Probar la conexión**.
- **Ningún evento desde hace días**: NESO solo convoca eventos cuando la red
  los necesita; el widget muestra el último.
- Registros: la integración registra su arranque, los nuevos eventos y los
  fallos. Para más detalle, defina la variable de entorno `LOG_LEVEL=debug`.

## Créditos

Datos: portal de datos de NESO, conjunto «Demand Flexibility Service», NESO
Open Data Licence — «Supported by National Energy System Operator open data».
Esta integración no tiene relación con NESO.
