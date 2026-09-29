<div align="center">

# Bench Studio

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

### Deja de alquilar la capa. Haz tuya la capa creativa.

Un estudio creativo local primero para imágenes, videos, sitios web, PDF diseñados y flujos de trabajo con agentes de IA.

[![MIT License](https://img.shields.io/badge/license-MIT-6D7CFF.svg)](LICENSE)
![Node 22.5+](https://img.shields.io/badge/node-22.5%2B-171A21.svg)
![73 model routes](https://img.shields.io/badge/model_routes-73-6D7CFF.svg)
![5 providers](https://img.shields.io/badge/providers-5-6D7CFF.svg)
![MCP ready](https://img.shields.io/badge/MCP-ready-171A21.svg)

**Este README instala, ejecuta y mantiene el estudio.** Qué es y por qué
funciona así se explica en **[docs/ABOUT.md](docs/ABOUT.md)**; los detalles
internos están en **[docs/COMO-FUNCIONA.md](docs/COMO-FUNCIONA.md)**.

**[Instalación local](#install-a--local-machine)** · **[Instalación en VPS](#install-b--vps-reachable-from-outside)** · **[Mantenerlo en ejecución](#keep-it-running-systemd)** · **[Actualizar](#updating-an-existing-install)** · **[Claves de API](#api-keys-what-is-required-and-how-to-change-them)** · **[Contraseñas](#passwords)** · **[Modos](#creation-modes-and-their-sub-controls)** · **[Mantenimiento](#maintenance)** · **[Acceso remoto](#remote-access-reference-remotesh)** · **[Seguridad](#security-and-privacy)**

</div>

## 📖 Guía de uso

Guía completa en portugués (landing + paso a paso): **https://inematds.github.io/bench-studio-br/guia/es/**

![Bench Studio model catalog](docs/bench-studio-models.png)

Bench Studio reúne **73 rutas seleccionadas de imágenes y video en 5 proveedores**, refinamiento de prompts,
controles según capacidades, custodia local de archivos y un registro transparente de costos
en una sola interfaz. El mismo sistema está disponible para Claude, Codex, Cursor
y otros clientes compatibles mediante MCP.

Tus claves permanecen en el servidor de tu máquina. Puedes editar tus prompts antes
de gastar. Tus resultados se guardan también localmente. Tus costos se registran en
unidades reales, en lugar de desaparecer en créditos misteriosos.

> [!NOTE]
> Esta es la distribución pública saneada. No incluye historial de generación,
> archivos subidos, base de datos privada, rutas personales, credenciales ni
> artefactos de compilación locales. Tu archivo comienza vacío.

## Los cinco verbos

Todo lo que normalmente necesitas es un script en la raíz. Sin banderas que memorizar ni
secuencias que debas ejecutar correctamente.

| Verbo | Qué hace |
| --- | --- |
| `./instalar.sh` (o `./install.sh`) | Primera instalación: comprueba Node, instala dependencias, crea `.env` y ejecuta el doctor. Se detiene si falta algún requisito. |
| `./atualizar.sh` | Todo lo que implica una actualización: descarga, instala, recompila, verifica y reinicia. Un solo comando. |
| `./start.sh` / `./start.sh --mobile` | Lo inicia en segundo plano y confirma que realmente esté activo; también inicia la interfaz para teléfono si lo pides. |
| `./stop.sh` | Detiene las interfaces y el servidor **de este proyecto**, y nada más en la máquina. |
| `./resolver.sh` | *«No funciona, ¿y ahora qué?»* Comprueba qué falla realmente, en el orden en que suele fallar, y corrige lo que es seguro corregir. `--so-ver` solo informa. |

Además, `./mobile.sh [subir|parar|status]` cuando solo importa la interfaz para
teléfono: es un proceso independiente de la interfaz de escritorio y se puede
gestionar por separado.

**Por qué `./atualizar.sh` y no simplemente `npm run update`.** La lógica de
actualización que se ejecuta es la copia **en disco**, es decir, la anterior.
Una mejora al actualizador solo entra en efecto la *próxima* vez que actualizas.
Así fue como una vez un VPS actualizó sus archivos y no se reinició: la versión
instalada allí todavía no sabía cómo hacerlo. `./atualizar.sh` invierte el orden:
primero descarga y después ejecuta la lógica recién obtenida, así que una pasada
siempre basta.

### Primera actualización de una instalación anterior

Cualquier instalación anterior a la 1.13.7 se encuentra con esto una sola vez.
El actualizador de esa máquina todavía no reinicia y, normalmente, la máquina ya
modificó o ensució algún archivo al ejecutarse. Desde la carpeta del proyecto:

```bash
git checkout -- stop.sh package-lock.json server/providers/kie.models.json
rm -f nohup.out
./atualizar.sh
./stop.sh && ./start.sh --mobile     # solo hace falta la primera vez
```

A partir de entonces, actualizar esa máquina es solo `./atualizar.sh`.

Si se niega y menciona archivos que no reconoces, ese es justamente el objetivo:
no sobrescribirá tu trabajo. Descártalos (`git checkout -- <file>`) si no los
modificaste intencionalmente, o usa `git stash` si sí lo hiciste.

## Instalación rápida

Seis scripts en la raíz cubren todo el ciclo de una instalación. Ejecútalos en
este orden; cada uno se detiene ante un problema, en vez de dejarte con una interfaz
que se abre pero no responde a nada.

```bash
# 1. obtener el código
git clone https://github.com/inematds/bench-studio-br.git
cd bench-studio-br

# 2. instalar — comprueba Node, instala dependencias, crea .env y ejecuta el doctor
./instalar.sh

# 3. iniciar — en segundo plano y confirma que los puertos realmente respondan
./start.sh --mobile        # sin --mobile, solo la interfaz de escritorio

# 4. a partir de aquí, actualizar requiere un solo comando
./atualizar.sh

# cuando algo parezca estar mal
./resolver.sh              # diagnostica y corrige lo que es seguro corregir
./resolver.sh --so-ver     # solo diagnostica, no modifica nada

# detenerlo o gestionar solo la interfaz para teléfono
./stop.sh
./mobile.sh [subir|parar|status]
```

Qué garantiza cada uno:

- **`./instalar.sh`** se niega a continuar con Node anterior a 22.5 —cuando el
  servidor no puede iniciarse— e indica exactamente cómo actualizar.
- **`./start.sh`** escribe en `~/bench.log` (`BENCH_LOG` lo sobrescribe), espera
  al puerto y muestra `/api/health`. `authRequired` significa que el servidor
  **está funcionando** y pide la contraseña que configuraste.
- **`./atualizar.sh`** descarga, instala, recompila, verifica y reinicia. Descarga
  *antes* de ejecutar la lógica de actualización, a propósito; consulta
  [Los cinco verbos](#los-cinco-verbos).
- **`./resolver.sh`** comprueba las cosas en el orden en que realmente fallan y
  se detiene en Node si ese es el problema, porque nada más importa hasta que se
  solucione. Nunca abre un puerto del firewall por ti: la exposición es decisión tuya.
- **`./stop.sh`** solo afecta los procesos iniciados desde *esta* carpeta.
- **`./mobile.sh`** existe porque la interfaz para teléfono es un proceso separado. Se
  niega a iniciarse mientras la API no esté activa, en vez de abrir una pantalla
  sin nada con qué comunicarse.

Los nombres en inglés también funcionan —`install.sh`, `npm run update`, `npm run doctor`
ejecutan el mismo código por debajo—, pero los scripts de arriba son el procedimiento documentado.

Publicar en la red requiere dos pasos más, en este orden; consulta
[Instalación B](#install-b--vps-reachable-from-outside):

```bash
npm run set-password        # la contraseña va ANTES de abrir el puerto
./scripts/remote.sh open
```

---

## Antes de empezar: qué necesitas

- **Node.js 22.5+** (se recomienda 24; el estudio usa `node:sqlite`) y npm.
  No se requiere nada más para iniciarlo. Comprueba `node -v` **antes** de instalar:
  una instalación nueva de Ubuntu suele incluir Node 20, y con la versión 20 el
  servidor no puede iniciarse (consulta [Cuando la interfaz se abre, pero no carga nada](#when-the-interface-opens-but-nothing-loads)).
  Para pasar el sistema a Node 24 sin mantener varias versiones instaladas a la vez:

  ```bash
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
  sudo apt install -y nodejs
  node -v && npm -v
  ```

  Eso reemplaza el Node del sistema. Para mantener varias versiones instaladas a la
  vez, usa nvm: `nvm install 24 && nvm use 24`. En ambos casos, si instalaste
  `node_modules` con la versión anterior, vuelve a instalarlo: `rm -rf node_modules && npm install`.
- **Un proveedor para generar contenido.** Todos son opcionales y funcionan
  independientemente: si falta una clave, esos modelos quedan marcados como no
  disponibles con el motivo y la solución, y el estudio sigue iniciando.

| Proveedor | Modelos | Costo | Qué necesitas |
|---|---|---|---|
| [fal.ai](https://fal.ai/dashboard/keys) | 37 | dólares, precios en tiempo real | `FAL_KEY` |
| [Kling](https://klingai.com) | 26 | créditos del plan | `npm i -g @klingai/cli-global && kling login` |
| [Agnes AI](https://apihub.agnes-ai.com) | 4 | cero | `AGNES_API_KEY` |
| [kie.ai](https://kie.ai/api-key) | 4 | créditos | `KIE_API_KEY` |
| [inemaimg](https://github.com/inematds/inemaimg) | 2 | cero (tu GPU) | un servidor local en ejecución |

Opcional, pero vale la pena: una clave de [Google AI Studio](https://aistudio.google.com/apikey)
o [OpenRouter](https://openrouter.ai/keys) para refinar prompts (sin una,
el prompt se envía tal cual y Agnes rechaza todo lo que no esté en inglés);
Google Chrome para imprimir PDF; una sesión iniciada en Codex o Claude Code para
crear sitios web y documentos con agentes.

**Luego elige tu camino. Son independientes a propósito: sigue uno, de principio a fin.**

| Tu situación | Ve a |
|---|---|
| Se ejecuta en la máquina que tienes delante | [Instalación A — máquina local](#install-a--local-machine) |
| Se ejecuta en un VPS o una máquina a la que accedes por la red | [Instalación B — VPS, accesible desde fuera](#install-b--vps-reachable-from-outside) |
| Funciona y quieres que sobreviva a los reinicios | [Mantenerlo en ejecución](#keep-it-running-systemd) |
| Funciona y quieres actualizarlo | [Actualizar una instalación existente](#updating-an-existing-install) |

---

## Instalación A — máquina local

Para tu propia laptop o computadora de escritorio. No se publica nada en la red:
ambos puertos responden solo en `127.0.0.1`.

```bash
# 0. requisitos, ANTES que nada — Node 22.5+ es obligatorio
node -v

# 1. código y dependencias (el clon NO incluye node_modules)
git clone https://github.com/inematds/bench-studio-br.git
cd bench-studio-br
npm install
npm run doctor          # Node, npm, git, dependencias, .env, puertos, repo — todo de una vez

# 2. archivo de credenciales (.env está en gitignore, así que el clon no lo incluye)
cp .env.example .env
#    completa lo que tengas — o déjalo vacío y usa después la pantalla Config

# 3. iniciar
npm run dev
```

Abre **[http://localhost:5200](http://localhost:5200)**. No hay contraseña:
hablar con tu propia máquina no debería requerir una.

| Servicio | Dirección |
| --- | --- |
| Studio | `http://localhost:5200` |
| API local | `http://localhost:8787` |
| Resumen de salud y capacidades | `http://localhost:8787/api/health` |

¿Te falta una clave? El botón **Config** (arriba a la derecha) muestra todos los
ajustes —presentes o faltantes, el origen del valor y sus últimos 4 caracteres—,
prueba cada proveedor y escribe `.env` por ti. Consulta [Claves de API](#api-keys-what-is-required-and-how-to-change-them).

Si un puerto está ocupado, el estudio **falla y lo indica** en vez de cambiar
silenciosamente al siguiente: una segunda interfaz que ningún firewall permite
es peor que un error claro:

```bash
PORT=8790 BENCH_API_PORT=8790 BENCH_WEB_PORT=5201 npm run dev
```

Eso es toda la instalación local. Las secciones de abajo son para el caso de red
y no aplican a tu caso.

---

## Instalación B — VPS, accesible desde fuera

Los mismos primeros pasos, más tres que solo importan cuando alguien más puede
acceder al puerto. Sigue los pasos en orden; ninguno es opcional.

```bash
# 0. PRIMERO NODE. Una instalación nueva de Ubuntu incluye Node 20 y el servidor no puede iniciarse con esa versión.
node -v                                   # se requiere 22.5+; se recomienda 24
#    Si es anterior, reemplaza el Node del sistema (el camino más simple, una sola versión):
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt install -y nodejs
node -v && npm -v
#    ¿Necesitas varias versiones instaladas a la vez? nvm install 24 && nvm use 24
#    (después lee la nota sobre PATH de systemd en "Mantenerlo en ejecución")

# 1. código y dependencias
git clone https://github.com/inematds/bench-studio-br.git
cd bench-studio-br

# 2. instalar y comprobar todos los requisitos — se detiene ante cualquier problema
./instalar.sh

# 3. credenciales
cp .env.example .env      # completa tus claves; ELIMINA las líneas para las que
                          # no tengas clave — una clave declarada pero vacía
                          # falla como "invalid credentials", y te lleva a
                          # buscar el problema equivocado

# 4. CONTRASEÑA, antes de abrir el puerto — este orden importa; consulta abajo
npm run set-password

# 5. publicar la interfaz + regla del firewall
./scripts/remote.sh open

# 6. iniciarlo para que siga activo cuando termine tu sesión SSH
./start.sh --mobile        # en segundo plano, espera los puertos e informa qué respondió

# 7. verificar — primero la máquina, después el navegador
./scripts/remote.sh status
ss -tlnp | grep 5200                      # debe mostrar 0.0.0.0:5200
curl -s localhost:8787/api/health         # {"ok":true,...} o authRequired
grep -c "\[server\]" ~/bench.log          # cero = el servidor nunca se inició
```

Sobre el paso 7: `authRequired` significa que el **servidor está funcionando** y
pide la contraseña que configuraste en el paso 4. Lo que no está bien es tener
cero líneas `[server]` en el registro: significa que solo se inició Vite, la
interfaz se abrirá y todas las llamadas `/api/` fallarán con `ECONNREFUSED`. Ve a
[Cuando la interfaz se abre, pero no carga nada](#when-the-interface-opens-but-nothing-loads).

El paso 6 debe mostrar `0.0.0.0:5200`. Si muestra `127.0.0.1:5200`, la interfaz
no detectó `BENCH_WEB_HOST`: actualiza primero (consulta
[Actualizar](#updating-an-existing-install)); una versión anterior a 2026-08-18
tenía ese error y `remote.sh` podía indicar OPEN mientras el socket seguía local.

Después abre `http://<your-ip>:5200` en tu navegador.

**Por qué la contraseña va antes que el puerto.** Solo se puede configurar desde
la propia máquina: `POST /api/config/password` responde 403 a cualquier solicitud
que no venga de loopback, tenga sesión o no. Eso impide que quien encuentre un
puerto abierto establezca su propia contraseña y te deje fuera. Una vez abierto
el puerto, ya no se puede cerrar esa brecha desde el otro lado: por eso la
instalación es el momento. `remote.sh open` te ofrece configurarla y te indica
claramente si la rechazas. Las reglas completas están en [Contraseñas](#passwords).

**Qué se mantiene privado.** Solo se expone la interfaz (5200). La API (8787) —
el puerto que escribe archivos y gasta dinero— permanece en loopback. La opción
explícita para desactivarlo es `BENCH_API_HOST=0.0.0.0`, y deberías tener un motivo.

**Para volver a cerrarlo**, cuando termine la prueba:

```bash
./scripts/remote.sh close
# después reinicia el estudio para cerrar realmente el socket abierto
```

Lee [Dejarlo en ejecución de forma segura](#leaving-it-up-safely) antes de
dejarlo activo más de una tarde: el tráfico es HTTP sin cifrar y se puede leer
durante el tránsito, hasta que algo delante de él termine TLS.

---

## Mantenerlo en ejecución (systemd)

Las dos instalaciones anteriores dejan un proceso que iniciaste manualmente.
Sobrevive al fin de tu sesión SSH (gracias a `setsid nohup`), pero **no a un
reinicio**, y `systemctl restart bench-studio` falla con *Unit not found* porque
este proyecto no instala ningún servicio. Un script lo crea:

```bash
./scripts/install-service.sh
```

Escribe `/etc/systemd/system/bench-studio.service`, recarga systemd, elimina
cualquier proceso que todavía use el puerto y habilita e inicia la unidad. Ejecuta
el estudio como el **propietario del repositorio**, en lugar de como quien escribió
`sudo`, y fija el directorio de Node en el `PATH` de la unidad: el `PATH` de systemd
es mínimo y, sin esto, Node instalado con nvm falla con `npm: command not
found` en un lugar donde solo el journal te lo indicaría.

```bash
sudo systemctl restart bench-studio    # ahora ya existe
sudo journalctl -u bench-studio -f     # registros
./scripts/install-service.sh --print   # ver la unidad sin instalarla
./scripts/install-service.sh --remove  # deshabilitarla y eliminarla
```

## La interfaz para teléfono (puerto 5300)

Una segunda interfaz, deliberadamente sencilla, para teléfono. **No** vuelve a
implementar el estudio: se comunica con la misma API en 8787, mediante las mismas
rutas que usa la versión de escritorio. No se modificó nada en `src/` para crearla
ni se añadió ninguna ruta al servidor: si funciona en escritorio, aquí también.

```bash
npm run mobile        # http://<your-lan-ip>:5300
npm run build:mobile  # compilación estática en dist-mobile/
```

En un VPS nginx la sirve en **`/m`** en el mismo dominio, junto a la versión de
escritorio; consulta [Producción](#production-two-steps-and-what-each-one-buys-you).
Sin un segundo puerto ni un segundo certificado.

Dos pantallas, y nada más. **Crear**: modo (con sus controles secundarios), imagen o
video, proveedor, modelo, prompt, refinar, adjuntar desde la galería o cámara, el
precio antes de confirmar y un botón grande para generar. **Galería**: 30 resultados
a la vez con la opción «cargar más», filtros por tipo, proveedor y modelo, y toque
para abrir en pantalla completa.

Lo que deliberadamente no incluye: el catálogo de modelos, proyectos ni configuración.
Se quedan en escritorio, donde hay espacio.

Conviene conocer tres decisiones, porque cada una surgió de algo que falló durante
las pruebas:

- **La cuadrícula nunca monta un `<video>`.** Treinta reproductores precargando
  metadatos congelaban incluso un navegador de escritorio, y en un teléfono
  también consumirían el plan de datos solo para mostrar miniaturas. Las
  miniaturas de video son marcadores de posición; el archivo solo se descarga
  cuando lo tocas.
- **Los modelos que requieren una imagen bajan al final de la lista**, salvo que
  hayas adjuntado una o estés en modo Reframe, donde la imagen *es* la entrada.
  La primera versión elegía de forma predeterminada un modelo de edición sin
  nada que editar, y la solicitud simplemente quedaba colgada.
- **Se vincula a `0.0.0.0` de forma predeterminada**, a diferencia de la interfaz
  de escritorio. Una interfaz móvil que solo responde en loopback no sirve:
  el teléfono nunca es la máquina que ejecuta el estudio. `BENCH_MOBILE_HOST` lo
  sobrescribe.

### Instalarlo en el teléfono (PWA)

Todo está listo: manifiesto, iconos y un service worker que solo guarda en caché
la estructura básica. Nunca se guarda en caché nada de `/api`, `/media`, `/inputs`,
`/previews` ni `/projects`: un registro desactualizado mostraría una galería antigua
como si estuviera al día.

Pero **para instalarlo se necesita HTTPS**, y ahí es donde muchos tropiezan. Chrome
solo ofrece la opción «Instalar» en un contexto seguro: HTTPS o `localhost`.
Acceder al estudio en `http://192.168.1.x:5300` no cumple ninguna de esas
condiciones, así que el service worker nunca se registra y no aparece la opción.
Por eso el worker solo se registra en compilaciones de producción: en desarrollo
guardaría módulos desactualizados en caché y haría parecer que Vite no funciona.

| Dónde lo abres | Qué obtienes |
| --- | --- |
| `http://<lan-ip>:5300` (dev) | Funciona plenamente. Sin instalación ni uso sin conexión. |
| `http://localhost:5300` en la propia máquina | Se puede instalar; útil para verificar la PWA. |
| `https://your.domain/m` (VPS, paso 2) | Se puede instalar en el teléfono, estructura básica disponible sin conexión e icono propio. |
| iPhone con HTTP sin cifrar | *Agregar a pantalla de inicio* sigue funcionando: icono y pantalla completa, pero sin service worker. |

Así que, si quieres instalarla de verdad en un teléfono, ponla detrás de nginx,
como en el paso 2. Un túnel (cloudflared, ngrok) o Tailscale también proporciona
un origen HTTPS válido si quieres probarla antes de configurar un dominio.

## Producción: dos pasos y lo que te aporta cada uno

Todo lo anterior ejecuta `npm run dev`: un servidor de **desarrollo** publicado
en la red. Funciona, pero ese servidor no se diseñó para eso. Pasar a producción
requiere dos pasos y puedes detenerte después del primero.

### Paso 1 — el mismo comando, bajo systemd

```bash
./scripts/install-service.sh
```

Esto te permite iniciar al arrancar, **reiniciar automáticamente si falla** y
consultar los registros con `journalctl`, en vez de depender de un `~/bench.log`
que nadie rota. Se acabó `setsid nohup`. Sigue siendo el servidor de desarrollo
de Vite: este paso soluciona *«se cayó y nadie lo notó»*, y nada más. Si el estudio
solo necesita permanecer activo mientras lo pruebas, detente aquí.

### Paso 2 — un artefacto compilado detrás de nginx, con TLS

Dos scripts, en este orden:

```bash
./scripts/production-build.sh                                    # 1. compilar + cambiar la unidad
./scripts/production-nginx.sh --domain your.domain --email you@your.domain   # 2. nginx + certificado
```

`production-build.sh` ejecuta el doctor, compila **ambas** interfaces —`dist/`
para escritorio y `dist-mobile/` para teléfono, esta última con la base `/m/`
para resolver sus recursos bajo esa ruta— y cambia la unidad de systemd para
ejecutar `npm run server`, solo la API. **Entre ambos scripts, la interfaz queda
fuera de servicio a propósito**: la aplicación Express sirve `/media`, `/inputs`,
`/previews` y `/projects`, pero nunca `dist/`. Alguien debe servir esos archivos
y ese alguien es nginx.

`production-nginx.sh` escribe la configuración del sitio, recarga nginx, abre
los puertos 80/443, cierra el 5200 y ejecuta certbot. El sitio sirve la versión
de escritorio en `/`, la interfaz para teléfono en `/m` (y redirige `/m` a `/m/`)
y envía `/api`, `/media`, `/inputs`, `/previews` y `/projects` al proceso Node.
Hay tres detalles deliberados y fáciles de configurar mal manualmente: `/m/` usa
`alias`, no `root`; con `root` nginx buscaría `dist-mobile/m/...` y respondería
404 a todo. `/m/sw.js` se sirve con `no-store`, o una versión nueva de la aplicación
quedaría atrapada detrás del service worker de ayer. El teléfono comparte el
certificado y la API de escritorio, así que no hace falta abrir un segundo puerto.
Dos valores de esa configuración son deliberados: se permiten cargas de hasta
128 MB (nginx tiene un límite predeterminado de 1 MB, que rechazaría una imagen
de referencia normal con un 413 que parece un error del estudio) y el proxy espera
hasta 15 minutos (el límite predeterminado de 60s cortaría una generación de video
activa con un 504). Revísalo primero con `--print`, que no escribe nada.

**Lo que aporta realmente el paso 2, en orden de importancia:**

1. **HTTPS.** Actualmente el tráfico es HTTP sin cifrar: tu contraseña del estudio y
   todo lo que escribas se puede leer durante el tránsito. En un VPS público, este
   argumento basta por sí solo.
2. **Menos exposición.** El servidor de desarrollo entrega el código fuente y los
   mapas de código; la compilación sirve un paquete minificado. Menos superficie de
   ataque y menos memoria inactiva.
3. **Páginas más rápidas.** Un paquete con hash, comprimido y guardado en caché por nginx,
   en vez de módulos servidos uno por uno.
4. **Comportamiento predecible.** Lo que está activo es un artefacto fijo que solo
   cambia cuando tú lo indicas, en lugar de un servidor que observa tus archivos.

**Lo que cuesta.** Cada actualización ahora requiere una nueva compilación:
`npm run update` la hace por ti cuando existe `dist/` (o `dist-mobile/`), pero
si compilas manualmente, recuerda hacerlo o el navegador seguirá mostrando el
paquete antiguo. También tendrás que mantener una configuración de nginx y un
certificado; a cambio, pierdes la recarga en vivo, que en un servidor es una ventaja.

TLS requiere un **dominio que apunte a la máquina**: Let's Encrypt no emite
certificados para una IP sin dominio. Si no tienes uno, ejecuta con `--no-tls` y
ten presente que la contraseña seguirá viajando sin cifrar.

Para volver atrás, usa un comando: `./scripts/install-service.sh --serve dev`.

## Actualizar una instalación existente

**Un comando, independientemente de cómo inicies el estudio:**

```bash
cd bench-studio-br
./atualizar.sh
```

Usa `./atualizar.sh`, no ejecutes `npm run update` directamente. La lógica que se
ejecuta es la copia **en disco**, es decir, la anterior; por lo tanto, una mejora
al actualizador solo entraría en efecto la *próxima* vez. `./atualizar.sh` primero
descarga y luego ejecuta la lógica recién obtenida, por eso una pasada siempre
basta. (También elimina automáticamente los archivos que la máquina reescribe y
el `nohup.out` que, de otro modo, bloquearían `git pull` con un mensaje que
asusta a cualquiera que solo quería actualizar).

Esa es toda la actualización. El proceso:

1. descarta los dos archivos que la máquina reescribe automáticamente:
   `server/providers/kie.models.json` (el servidor reescribe `generated_at` en
   cada inicio) y `package-lock.json` (npm install), además de los resultados
   de compilación (`dist/`, `dist-mobile/`, `node_modules/`), que vuelve a generar;
2. solo avanza mediante fast-forward, nunca hace merge;
3. reinstala dependencias si cambió `package.json` o falta `node_modules`;
4. vuelve a compilar `dist/` y `dist-mobile/` si existen; en producción, el navegador
   recibe el paquete compilado, así que omitir este paso deja en pantalla la aplicación
   de ayer;
5. ejecuta `npm run doctor`;
6. **reinicia** y vuelve exactamente a lo que estaba en ejecución: el servicio de
   systemd, si existe; de lo contrario, `stop.sh` + `start.sh`. Si la interfaz
   estaba publicada en la red, vuelve a estar publicada, y la interfaz para teléfono
   también vuelve si estaba activa.

Si tienes cualquier otro cambio local, el proceso **se detiene y te muestra los
archivos** en vez de sobrescribirlos: `git stash`, actualiza y luego `git stash pop`.
Usa `--no-restart` (`npm run update -- --no-restart`) para actualizar los archivos
sin tocar el proceso activo.

El paso 6 existe porque omitirlo es la forma más segura de concluir que una
solución no funcionó: código nuevo en disco, código antiguo en memoria.

Un `git pull` normal también funciona, pero en una máquina que ya ejecutó el
estudio suele abortar con *«local changes would be overwritten»* en esos mismos
dos archivos; `npm run update` se ocupa de eso.

```bash
# equivalente manual, si prefieres ver cada paso
git checkout -- package-lock.json server/providers/kie.models.json
git pull
npm install       # no hace nada si nada cambió
npm run build     # en la práctica no hace nada si nunca sirves dist/
npm run doctor    # confirma que la máquina siga cumpliendo los requisitos
```

Después reinícialo **de la misma forma en que lo iniciaste**. Este proyecto no
instala ningún servicio, así que `systemctl restart bench-studio` solo funciona
si creaste esa unidad por tu cuenta; consulta *Ejecutarlo como servicio* en
Mantenimiento. Si lo iniciaste manualmente:

```bash
pkill -f 'server/server.mjs'   # detiene el estudio (servidor + interfaz)
npm run dev                    # o el comando que uses para mantenerlo activo
```

¿No sabes cómo está en ejecución? Esto te lo indica:

```bash
ps -o pid,lstart,args -p $(pgrep -f 'server/server.mjs') 2>/dev/null
systemctl list-units --type=service | grep -i bench   # si no muestra nada, no hay unidad
```

Por qué `npm run build` aparece en la lista aunque la mayoría use `npm run dev`:
`dist/` no está versionado, así que `git pull` nunca actualiza un sitio que se sirve
precompilado. Ejecutar la compilación cuando no hace falta cuesta tres segundos
y deja una carpeta sin usar; omitirla cuando sí hacía falta deja la interfaz
congelada en la versión anterior mientras el servidor se actualiza por debajo.
Parece un error, pero no lo es. Compilar siempre es el error más barato.

*(Si de todos modos quieres saberlo: si el comando que mantiene activo el estudio es
`npm run dev`, Vite sirve el código fuente y no hace falta compilar. Si un servidor web
responde en el puerto 80/443 y reenvía solicitudes al estudio, sirve `dist/` y la
compilación es obligatoria.)*

**Un cambio puede afectar una instalación existente:** la API ahora se vincula a
loopback de forma predeterminada (`BENCH_API_HOST`). Antes escuchaba en todas las
interfaces, lo que significaba que publicar la interfaz también publicaba el
puerto 8787, el que escribe archivos y gasta dinero. Esto no afecta a un proxy
inverso en la misma máquina que se comunica con `127.0.0.1:8787`. Cualquier acceso
al 8787 desde otro host dejará de funcionar; la opción explícita para desactivarlo
es `BENCH_API_HOST=0.0.0.0` en `.env`.

`server/capabilities.json` está versionado, pero no requiere pasos manuales:
se reconstruye automáticamente cuando cambian las entradas declaradas de un
modelo. Después de reiniciar en una máquina accesible desde fuera, `./scripts/remote.sh status`
te indica en una línea si el puerto está abierto, en qué dirección, con o sin
contraseña y si el firewall está activo.

### Cambios recientes

| Área | Cambio |
| --- | --- |
| Cuadros de referencia | Los modelos que aceptan un primer y último cuadro ahora muestran dos selectores con nombre y número, en vez de una lista anónima: 10 rutas, incluida la de Kling (`--tailImage`, una opción del lado de la CLI que nunca aparece en `who_am_i`). |
| Selector de modelos | Filtra por proveedor; la búsqueda ya no cancela el filtro de resultados: los tres criterios se combinan y aparece una salida cuando la lista queda vacía. Cambiar entre imagen y video ya no cierra el panel, y la lista se abre desplazada hasta el modelo en uso. |
| Capacidad | Cada modelo indica qué acepta antes de adjuntar: *1 imagen de referencia*, *hasta 10*, *primer + último cuadro*. Se obtiene del esquema del endpoint, no de una lista escrita manualmente. |
| Costo | Una unidad de facturación desconocida ya no cuenta como una unidad. Seedance 2.5 cobra en «1000 tokens» y antes mostraba un precio fijo de $0.0214 tanto para un clip de 5s como para uno de 30s; ahora se indica que no se puede cotizar y se muestra claramente el precio por unidad. |
| Archivos adjuntos | Las referencias de `/previews` o `/projects` llegaban al proveedor como una ruta sin procesar (`image must be a public http(s) URL`). Ahora se resuelven las cuatro rutas estáticas, y si una no se puede resolver, falla aquí e indica el archivo faltante. |
| Errores | La CLI de Kling escribe todos los errores en stderr y deja stdout vacío. Ese flujo se descartaba, así que todos los errores se mostraban como «session expired». Ahora se captura y se muestra. |
| Acceso remoto | `scripts/remote.sh`, las secciones anteriores y `docs/ACESSO-REMOTO.md`. Ya no se anuncia que el estudio publicado *con* una contraseña carece de autenticación. |
| Catálogo | Sin miniaturas de muestra; encabezados de sección más grandes, un color por ruta; filtros y controles para todo el catálogo separados. |

## Claves de API: qué se necesita y cómo cambiarlas

**No es necesario tenerlas todas.** El estudio se inicia con lo que haya y el
catálogo explica qué no está disponible y por qué. Para generar cualquier cosa
necesitas **uno** de estos cinco proveedores; todo lo demás es complementario.

| Quieres… | Mínimo |
| --- | --- |
| Iniciar el estudio, explorar el catálogo y usar MCP | solo Node |
| Generar imágenes o video con la configuración útil más económica | `AGNES_API_KEY` (nivel gratuito; solo prompts en inglés) |
| Generar con el catálogo más amplio | `FAL_KEY` (37 rutas, facturación en dólares) |
| Generar en tu propia GPU | un [inemaimg](https://github.com/inematds/inemaimg) activo en `INEMAIMG_URL` |
| Refinar y traducir prompts | `GOOGLE_API_KEY` **o** `OPENROUTER_API_KEY` |
| Usar la ruta propia de Kling | ninguna clave: `npm i -g @klingai/cli-global && kling login` |

Vale la pena explicar el refinamiento de prompts: sin ningún refinador, tu idea
se envía tal cual y Agnes rechaza directamente el portugués. Es opcional en el
código, pero en la práctica casi obligatorio.

`.env.example` documenta las 17 variables: qué habilita cada una, cómo se factura
y dónde crearla. Es la referencia; esta tabla solo muestra el camino más corto.

### Tres maneras de definir una clave, un orden de precedencia

```
exportada en tu shell   >   .env del proyecto   >   ~/.env
```

Por eso la pantalla Config advierte sobre valores *enmascarados*: escribir una clave
en `.env` no cambia nada si tu shell ya la exporta; debes reiniciar sin esa
exportación. Un guardado que no hace nada en silencio es peor que una negativa.

1. **La pantalla Config** (botón arriba a la derecha): muestra todas las variables,
   si están presentes, de dónde viene el valor y sus últimos 4 caracteres; prueba
   cada proveedor y escribe `.env` por ti con permisos `600`. Nunca muestra el valor
   y solo acepta escrituras desde la máquina donde se ejecuta el estudio.
2. **`.env` en el proyecto**: ejecuta `cp .env.example .env` y luego edítalo. Este es
   el archivo que escribe la pantalla Config y el que modifica `remote.sh`.
3. **Exportada en el shell**: útil para una ejecución puntual o cuando un gestor de
   secretos la inyecta:
   ```bash
   FAL_KEY=... npm run dev
   ```

### Rotar o reemplazar una clave

```bash
# 1. cambiar el valor (pantalla Config o editar .env)
# 2. reiniciar: las claves se leen al arrancar
# reinicia el estudio como sea que lo ejecutes (consulta Actualizar una instalación existente)
# 3. confirmar desde la máquina
curl -s localhost:8787/api/health | head
```

La pantalla Config incluye un botón **Test** para cada proveedor. Hace una llamada
real e informa qué respuesta recibió; es la forma más rápida de distinguir una
clave incorrecta de un saldo vacío. La falta de una clave o una clave inválida
no rompe el estudio: los modelos de ese proveedor quedan marcados como no
disponibles, con el motivo y la solución, y el resto sigue funcionando.

Para eliminar una clave, sigue los mismos pasos: borra el campo o la línea,
reinicia y esos modelos volverán a estar no disponibles.

### Kling es la excepción

Se autentica mediante OAuth con su propia CLI, no con una clave en `.env`:

```bash
npm i -g @klingai/cli-global
kling login
node server/providers/kling_sync.mjs   # vuelve a leer la lista de modelos de la cuenta
```

El token está en `~/.kling/`. Si la sesión vence, las generaciones fallan con el
mensaje de la CLI y `kling login` lo resuelve.

## Contraseñas

El estudio se distribuye **sin contraseña**, a propósito: hablar con tu propia
máquina no debería requerir iniciar sesión. Esta sección aplica desde el momento
en que deja de ser solo tu máquina.

```bash
npm run set-password              # establecer o reemplazar; tiene efecto inmediato
npm run set-password -- --remove  # eliminar
```

- **Solo puede ejecutarse en la propia máquina**, desde el teclado o por SSH.
  `POST /api/config/password` responde 403 a cualquier solicitud que no venga de
  loopback, tenga sesión o no. No es un descuido, sino una medida de protección:
  impide que quien encuentre un puerto abierto establezca una contraseña propia
  y deje afuera al propietario. La pantalla Config lo explica en vez de mostrar
  un campo inactivo.
- **Se guarda como un hash scrypt** en `BENCH_PASSWORD`. Nadie puede leer tu
  contraseña desde `.env`.
- **No hace falta reiniciar** para establecerla o cambiarla. Todas las demás
  sesiones se cierran de inmediato.
- **¿La olvidaste?** Elimina la línea `BENCH_PASSWORD` de `.env` y reinicia. Esta
  recuperación existe a propósito: quien tiene ese archivo ya tiene las claves
  de los proveedores que contiene, así que proteger la contraseña más que el
  archivo donde está no protegería nada.
- **Establécela antes de abrir el puerto**, no después; consulta el orden en la
  siguiente sección. `./scripts/remote.sh open` te ofrece hacerlo y te indica
  claramente si lo rechazas.

La contraseña protege la API y tus archivos generados. La estructura de la
interfaz sigue disponible para quien acceda al puerto, pero sin una sesión no
muestra nada. Ocultar también esa estructura es tarea de un proxy inverso, no
de este proceso.

## Modos de creación y sus controles secundarios

La pestaña **Modes** permite editar cómo redacta prompts el estudio, sin tocar el código.

Un modo tiene dos partes, que se incorporan a la solicitud en momentos distintos:

```
tu idea original ──────────────────────────┐
                                           ├─► refinador ─► prompt final ─► modelo
brief ──────────► instrucción del sistema ─┘                   ▲
                                                               │
controles secundarios ────► "Creative direction: ..." ────────┘
```

- **El brief nunca aparece en el prompt.** Es la instrucción que recibe el
  *refinador*: la regla para reescribir tu idea. Escríbela como una directriz
  («mantén un creador, un producto y un entorno»), no como una descripción de escena.
- **Los controles secundarios sí aparecen literalmente.** Cada uno aporta
  `field: value` y el conjunto se agrega como `Creative direction: creator: a woman in her 20s;
  setting: a real home setting.` Por eso los valores de fábrica están en inglés:
  el modelo los lee. Solo se traduce la etiqueta. En un modo creado por ti,
  tanto la etiqueta como el valor son texto tuyo, en el idioma que uses.

### Editar, ocultar y restaurar

Todos los modos se pueden editar, **incluidos los siete de fábrica** (Freeform, UGC,
Unboxing, Hyper Motion, TV Spot, Product Still, Ad with Headline):

| Acción | Qué sucede |
| --- | --- |
| **Editar** un modo de fábrica | tu versión se superpone como una modificación; el original permanece intacto en el código |
| **Ocultar** un modo de fábrica | desaparece de la barra de creación y pasa a *Hidden* en la pestaña Modes; no se elimina nada |
| **Restaurar** | deshace tanto la edición como la ocultación con un solo clic |
| **Eliminar** un modo creado por ti | lo elimina de verdad |

Todo lo que cambias se guarda en `data/modes.json`. Si eliminas ese archivo, el
estudio vuelve a su estado de fábrica, independientemente de cuánto lo hayas cambiado.

### ¿Cuántos controles secundarios puede tener un modo?

**No hay límite.** Unboxing viene con tres (`view`, `surface`, `moment`) y UGC
con cuatro, pero eso es una decisión editorial, no un límite: agrega tantos
campos como quieras a cualquier modo, incluidos los de fábrica, y tantas
opciones como quieras en cada uno. Todo es texto libre.

Conviene saber dos cosas antes de agregar diez:

- Cada valor seleccionado termina en el prompt. Quince campos generan un
  párrafo de indicaciones que compite con tu propia idea por la atención del
  modelo; por eso los modos de fábrica se limitan a tres o cuatro, no porque
  fuera imposible agregar más.
- Un campo sin opciones se descarta al guardar: un selector sin opciones solo
  sería un control inactivo en pantalla.

En el editor, cada opción ocupa **su propia línea**: escríbela, presiona Enter y
ya estará lista la siguiente línea vacía. Antes todas las opciones iban en un
solo campo separadas por comas, lo que hacía imposible incluir una coma dentro
de un valor. `de cima, mãos abrindo` es una indicación válida que antes se dividía en dos.

## Cuando la interfaz se abre, pero no carga nada

El único fallo que parece un problema de red, pero no lo es. El síntoma: la página
responde en `:5200` y **todas** las llamadas `/api/` fallan con `ECONNREFUSED` en
el registro del proxy de Vite.

`npm run dev` inicia el servidor y Vite en paralelo. Cuando el servidor falla,
Vite sigue iniciándose, así que la interfaz se abre pero no tiene con qué
comunicarse. Casi siempre la causa es Node: la base de datos importa
`node:sqlite`, que solo existe desde Node 22.5, y con Node 20 el proceso termina
de inmediato con `ERR_UNKNOWN_BUILTIN_MODULE`.

```bash
node -v                              # si es anterior a 22.5, esa es la respuesta
grep -c "\[server\]" ~/bench.log     # cero líneas del servidor = nunca se inició
```

Desde la versión 1.6.4, `npm run dev` se niega a iniciar con una versión antigua
de Node e indica qué instalar, en vez de terminar con un stack trace. Si tienes
la versión silenciosa, actualiza Node como se indica en [qué necesitas](#before-anything-what-you-need).

### Antes de depurar nada: qué máquina y qué puerto

La mayor parte del tiempo perdido en un VPS no se debe a un error: se pierde
depurando el host equivocado. Siempre empieza con estas dos comprobaciones:

```bash
hostname            # ¿es esta la máquina que realmente sirve el estudio?
curl -s ifconfig.me # ¿es esta la IP a la que resuelve tu dominio?
```

Si tienes más de un servidor, es muy posible actualizar uno, reiniciarlo,
verificarlo y estar mirando el otro en el navegador durante todo el proceso.
Confirma la versión mediante el **proceso en ejecución**, nunca mediante los archivos:

```bash
curl -s localhost:8787/api/health   # {"ok":true,"version":"…"}  o authRequired
```

`authRequired` significa que el servidor está funcionando y pide la contraseña que configuraste.

**Un dominio que resuelve a otra máquina no puede obtener un certificado.**
Let's Encrypt valida accediendo a la IP a la que resuelve el dominio. Si
`dig +short your.domain` no coincide con `curl -s ifconfig.me` en la máquina del
estudio, `production-nginx.sh` fallará durante el paso de certbot, y ninguna
bandera puede resolverlo. Corrige primero el registro DNS o apunta un subdominio
nuevo a la máquina correcta; eso no afecta lo que ya funciona.

### La interfaz para teléfono no responde

Es un **proceso separado** del de escritorio. Actualizar, reiniciar o abrir la
versión de escritorio no dice nada sobre ella.

```bash
ss -tlnp | grep -E '5200|5300'   # ¿está 5300 presente y en 0.0.0.0, no en 127.0.0.1?
```

- **No hay nada en 5300**: nunca se inició. `./start.sh --mobile` inicia ambas
  interfaces y `./mobile.sh subir` inicia solo la de teléfono. `./atualizar.sh`
  vuelve a iniciar lo que ya estaba en ejecución, que no es lo mismo que
  iniciarlo por primera vez.
- **Responde por IP, pero no por nombre**: `403 Blocked request. This host is not
  allowed` viene de Vite, que rechaza un encabezado `Host` desconocido (protección
  contra la revinculación de DNS). Como la IP funciona, parece un problema de DNS
  o del firewall, pero no es ninguno de los dos. Corregido en 1.15.11; si tienes
  una instalación anterior, actualízala.
- **Está en 5300, pero no se puede acceder desde el teléfono**: firewall:
  `ufw allow 5300/tcp`.
- **Se inició y falló**: el motivo está en el registro. La forma más rápida de
  leerlo es ejecutarlo en primer plano, donde nada oculta el error:

```bash
cd <project> && npm run mobile 2>&1 | head -30
```

`Missing script: mobile` y la ausencia de la carpeta `mobile/` significan lo
mismo: la descarga no se completó. Ejecuta `npm run update` y lee toda la salida;
el proceso se detiene e indica los archivos cuando un cambio local podría sobrescribirse.

En producción detrás de nginx, nada de esto aplica: la interfaz para teléfono se
sirve en `/m` bajo el mismo dominio y el puerto 5300 no se usa.

### Los fallos que encontramos, según el síntoma

Cada línea de abajo nos costó tiempo real en una máquina real. `npm run doctor`
ahora detecta los primeros cuatro antes de que causen problemas.

| Síntoma | Causa real | Solución | Desde |
| --- | --- | --- | --- |
| La interfaz se abre, todas las llamadas `/api/` devuelven `ECONNREFUSED` y no hay líneas `[server]` en el registro | Node 20: el servidor termina al importar `node:sqlite`, pero Vite se inicia de todos modos | Node 22.5+: ahora `npm run dev` se niega a iniciar en vez de fallar en silencio | 1.6.4 |
| `Upload failed: fal rejected the current API credentials` al convertir imagen a imagen, mientras que texto a imagen funciona | La ruta de carga enviaba todas las referencias de proveedores a fal. En texto a imagen no se carga ningún archivo, así que solo fallaba la ruta de referencias | Ahora las referencias usan como alternativa la copia local en `/inputs/`; la carga a fal es opcional | 1.6.2 |
| El mismo 401, con el mensaje `Invalid Authorization header format` | Una línea `.env` que declaraba `FAL_KEY=` sin valor: el encabezado se enviaba como `Key ` | Elimina la línea en vez de dejarla vacía. `npm run doctor` lo detecta | 1.6.5 |
| El modelo cambió solo después de adjuntar una imagen | Era un atajo deliberado: un modelo de texto a X delegaba el trabajo a su variante compatible con imágenes, pero lo hacía en silencio | Ahora pregunta antes, en un cuadro de diálogo de la aplicación | 1.6.3 |
| `git pull`: *«local changes would be overwritten»* en archivos que nunca tocaste | La máquina los reescribe: `kie.models.json` (al iniciar) y `package-lock.json` (npm install) | `npm run update` descarta exactamente esos dos, y nada más | 1.7.5 |
| Una solución que «no funcionó» en el VPS | Se descargó en una **máquina distinta** de la que sirve el estudio | Ejecuta `hostname` primero. Confirma la versión mediante el proceso en ejecución —`curl -s localhost:8787/api/health`—, no solo con los archivos | — |
| Una solución que «no funcionó» en la máquina correcta | La actualización dejó código nuevo en disco y el proceso anterior en memoria | `npm run update` ahora también reinicia (desde 1.13.7) | 1.13.7 |
| `<domain>:5300` nunca responde | El dominio resuelve a una máquina que no ejecuta el estudio | Compara `dig +short <domain>` con `curl -s ifconfig.me` en el host del estudio | — |
| `<domain>:5300` responde `403 Blocked request`, pero la IP funciona | Vite rechaza un encabezado `Host` desconocido | Actualiza: a la configuración del teléfono le faltaba `allowedHosts` | 1.15.11 |
| `./algo.sh: command not found` | Unix no busca en la carpeta actual | Añade el prefijo: `./atualizar.sh` | — |
| `git pull` bloqueado por un archivo que nunca editaste | Solo cambió el **permiso** (`old mode 100755 / new mode 100644`); git lo considera un cambio | `git checkout -- <file>` o simplemente `./atualizar.sh` | — |
| Actualizaste, pero el proceso todavía muestra la versión anterior | La actualización descargó y luego salió diciendo «already up to date» | `./atualizar.sh` ahora también compara la versión en ejecución | 1.15.12 |
| certbot falla en un dominio que te pertenece | Lo mismo: el registro apunta a otro lugar | Corrige el registro A o usa un subdominio que apunte a la máquina del estudio | — |
| `authRequired` en `/api/health` | Hay una contraseña configurada; el servidor está funcionando | Inicia sesión desde la interfaz | — |
| El puerto 5200 no es accesible desde fuera | Falta una regla del firewall | `./scripts/remote.sh open` | — |

Dos hábitos habrían evitado la mayoría de estos problemas: leer la versión del
**proceso en ejecución**, no de los archivos en disco, y comprobar `node -v`
antes de sospechar de la red.

## Mantenimiento

Cuidados rutinarios, más o menos en orden de frecuencia.

| Tarea | Comando |
| --- | --- |
| Actualizar la instalación | `npm run update`, luego reinicia |
| Pasar a producción (compilación + nginx + TLS) | `./scripts/production-build.sh` y luego `./scripts/production-nginx.sh --domain …` |
| Comprobar requisitos (Node, dependencias, puertos, claves) | `npm run doctor` |
| ¿Está funcionando bien? | `curl -s localhost:8787/api/health` |
| ¿Está expuesto y de qué forma? | `./scripts/remote.sh status` |
| Buscar nuevos endpoints de proveedores | `npm run catalog:sync` |
| Reconstruir el registro de modelos | `npm run registry` |
| Reconstruir el manifiesto de entradas | `npm run capabilities` |
| Comprobar el contrato de MCP | `npm run test:mcp` |
| Ejecutar la suite rápida de pruebas | `npm run test:contracts` |
| Comprobación completa antes del lanzamiento | `npm run test:release` (necesita `FAL_KEY`; consulta Problemas conocidos) |

¿Necesitas que sobreviva a un reinicio? Consulta [Mantenerlo en ejecución](#keep-it-running-systemd).

**Dónde se guardan tus datos.** Todo está en `data/`, que está en gitignore:
`data/outputs` (contenido multimedia generado, guardado también localmente porque
las URL de los proveedores vencen), `data/inputs` (lo que adjuntaste), `data/previews`,
`data/projects` (compilaciones de sitios web y documentos) y `data/bench.db`
(historial, gastos y comprobaciones de capacidades). Haz una copia de esa carpeta
para respaldar todo el estudio; `BENCH_DATA_DIR` permite trasladarla a otro lugar,
por ejemplo a un disco con más espacio.

**El disco se llena con el uso.** El video generado ocupa la mayor parte.
Eliminar archivos de `data/outputs` libera espacio y conserva la entrada del
registro: la fila mantiene el costo y el modelo que lo generó, y solo desaparece
la copia local.

**El catálogo se actualiza automáticamente.** El intervalo es el selector `auto`
en la línea del título del catálogo (manual, 1h, 6h, 24h, semanal); `Refresh catalog`
al lado lo actualiza en ese momento. `server/capabilities.json` está versionado,
pero se invalida automáticamente: cuando cambian las entradas declaradas de un
modelo, se reconstruye en el siguiente inicio.

**Si la interfaz parece desactualizada después de actualizar**, normalmente se
debe a la compilación: `dist/` no está versionado, así que un sitio precompilado
sigue sirviendo el paquete antiguo hasta ejecutar `npm run build`. Consulta
*Actualizar una instalación existente*.

## Referencia de acceso remoto (`remote.sh`)

El paso a paso para una instalación en red está en
[Instalación B](#install-b--vps-reachable-from-outside). Esta sección es la
referencia del script que utiliza.

```bash
./scripts/remote.sh open                    # publica la interfaz en la IP de esta máquina
./scripts/remote.sh open --ip 203.0.113.7   # ...pero solo para esa dirección
./scripts/remote.sh open --firewall         # también habilita ufw (primero permite SSH)
./scripts/remote.sh close                   # vuelve al acceso local únicamente
./scripts/remote.sh status                  # abierto o cerrado, y con qué protección
```

**Qué modifica, y nada más:**

- `.env`: `BENCH_WEB_HOST=0.0.0.0` y `BENCH_API_HOST=127.0.0.1`, con permisos `600`
- `ufw`: primero `allow OpenSSH` y después `allow <port>/tcp`
- `data/remote.state`: el puerto, el valor anterior de `BENCH_WEB_HOST`, si se creó
  la regla, cualquier restricción de IP y cuándo

**Decisiones de diseño del script:**

- **`close` lee el archivo de estado**, así deshace lo que hizo *esa* ejecución de
  `open` y no lo que suele hacer `open`.
- **La regla SSH se permite antes de cualquier `ufw enable` y nunca se elimina.**
  Borrarla es la forma de quedar fuera de tu propio servidor.
- **Es idempotente.** Ejecutarlo dos veces no rompe nada.
- **No habilita el firewall por sí solo.** Si ufw está instalado pero inactivo,
  lo indica y ofrece `--firewall`, en vez de cambiar la política de la máquina.
- **Nunca publica la API.** El puerto 8787 permanece en loopback.

**Es necesario reiniciar después de `open` y de `close`**, porque ambos modifican
`.env` y el proceso lee al iniciarse el host al que debe vincularse. Hasta que
reinicies, el archivo dice una cosa y el socket activo hace otra; `status` lo indica.

> **Si actualizas desde una versión anterior a 2026-08-18:** `open` podía indicar
> OPEN, escribir `.env`, agregar la regla del firewall y aun así la interfaz
> solo respondía en `127.0.0.1`. Vite no carga `.env` en `process.env` al evaluar
> su configuración, así que `vite.config.js` nunca veía `BENCH_WEB_HOST`: el
> servidor leía el archivo, pero la interfaz no. Ahora lo lee directamente de
> `.env`, con la misma precedencia.

Las reglas de contraseñas aplicables a todo esto están en [Contraseñas](#passwords);
el orden de protección está en [Dejarlo en ejecución de forma segura](#leaving-it-up-safely).

## Dejarlo en ejecución de forma segura

Más o menos en orden de lo que realmente te protege:

1. **Establece una contraseña al instalar.** Si la máquina será accesible,
   inclúyela como parte de la configuración: `npm install`, luego
   `npm run set-password` y después `./scripts/remote.sh open`. En ese orden,
   el estudio nunca queda abierto sin contraseña y nunca necesitas usar por red
   una pantalla para contraseñas que solo funciona localmente.
2. **Mantén la API en loopback.** Es la opción predeterminada.
   `BENCH_API_HOST=0.0.0.0` es una opción para desactivarlo y deberías tener un motivo.
3. **Limita quién puede acceder.** `./scripts/remote.sh open --ip <your-ip>` es
   mejor que dejar un puerto abierto. Una dirección de Tailscale es mejor que
   ambas opciones y no requiere ningún puerto.
4. **Activa el firewall.** `./scripts/remote.sh open --firewall` permite primero
   SSH y después habilita ufw. Comprueba también el panel de firewall del
   proveedor de VPS: está delante de ufw y no se puede gestionar desde la máquina.
5. **Termina HTTPS en un servicio frontal.** Apunta un dominio a la máquina y
   coloca nginx o Caddy delante, con un certificado de Let's Encrypt. Configura
   el proxy para `/api`, `/media`, `/previews`, `/inputs` y `/projects` hacia
   `127.0.0.1:8787`, y sirve el `dist/` de `npm run build` como sitio. Después
   cierra por completo el puerto 5200. Si haces esto, configura el proxy para
   enviar `X-Forwarded-For`: la regla de acceso exclusivo desde la máquina
   depende de ese encabezado.
6. **Ejecútalo con su propio usuario, no como root**, bajo una unidad de systemd
   y con `.env` en permisos `600`, tal como lo escribe el estudio.
7. **Ciérralo cuando termine la prueba.** `./scripts/remote.sh close`. Una
   exposición olvidada es la que te cuesta créditos de proveedores.

## Documentación

| Documento | Qué cubre |
|---|---|
| [`docs/ABOUT.md`](docs/ABOUT.md) | Qué es el estudio, el razonamiento detrás de cada decisión y qué cosas deliberadamente no hace: todo lo que este README explicaba antes entre los pasos de instalación |
| [`docs/COMO-FUNCIONA.md`](docs/COMO-FUNCIONA.md) | Cómo funciona el sistema internamente: el contrato de proveedores, las particularidades medidas por proveedor, las categorías de costos, disponibilidad frente a selección, la cadena de refinamiento, el creador y el modelo de seguridad |
| [`docs/ACESSO-REMOTO.md`](docs/ACESSO-REMOTO.md) | Acceso remoto y VPS: por qué la contraseña va antes que el puerto, qué modifica `remote.sh`, el orden de protección y qué sigue pendiente |
| [`docs/KIE-MODELOS.md`](docs/KIE-MODELOS.md) | Análisis del catálogo de kie.ai (169 modelos): identificadores reales de la API, entradas de cada uno, cuáles tienen cuadro inicial y final, y por qué solo hay cuatro registrados |
| [`docs/HISTORICO.md`](docs/HISTORICO.md) | Todo lo que se creó sobre el kit original y cada error encontrado; distingue los que ya existían de los introducidos en el proceso |
| [`CHANGELOG.md`](CHANGELOG.md) | Versión por versión |
| [`.env.example`](.env.example) | Los 16 ajustes, qué habilita cada uno y dónde obtener la clave |
| [`SECURITY.md`](SECURITY.md) | Modelo de amenazas e informes |

## Comandos útiles

| Comando | Propósito |
| --- | --- |
| `npm run dev` | Iniciar la API local y la interfaz web. |
| `npm run build` | Compilar la aplicación web de producción. |
| `npm run registry` | Reconstruir el registro seleccionado de modelos. |
| `npm run capabilities` | Reconstruir el manifiesto de capacidades. |
| `npm run catalog:sync` | Actualizar el descubrimiento de proveedores y los datos de precios. |
| `npm run mcp` | Iniciar el servidor MCP de stdio. |
| `npm run set-password` | Establecer o cambiar la contraseña del estudio (`-- --remove` la elimina). |
| `npm run test:contracts` | Ejecutar las pruebas de API, persistencia y contratos de modelos. |
| `npm run test:mcp` | Probar el descubrimiento MCP y el comportamiento de los archivos multimedia. |
| `npm run test:e2e` | Ejecutar recorridos en el navegador y comprobaciones de accesibilidad (necesita ejecutar `npx playwright install chromium` una vez). |
| `npm run test:release` | Ejecutar la comprobación completa antes del lanzamiento. |

## Seguridad y privacidad

**Configuración predeterminada.** Ambos puertos se vinculan a loopback y **no
hay contraseña**: hablar con tu propia máquina no debería requerir una. Nada sale
de tu máquina excepto las llamadas a los proveedores que configuraste.

**Claves.** Se leen del lado del servidor y nunca se devuelven a la interfaz.
La pantalla Config muestra si están presentes, su origen y los últimos 4
caracteres; nunca muestra el valor. `.env` se escribe con permisos exclusivos
para el propietario (`600`) y está en gitignore.

**Contraseña opcional.** Configura `BENCH_PASSWORD` y la API requerirá una sesión.
Es un hash scrypt, solo se puede configurar desde la propia máquina y, si la
olvidas, puedes recuperarla eliminando la línea; las reglas completas están en
[Contraseñas](#passwords).

**La configuración solo se puede modificar desde la máquina.** Incluso con una
sesión válida, se rechazan las solicitudes `POST` a los endpoints de
configuración que provengan de la red: para cambiar las claves hay que estar en
la máquina. Esto también se aplica al proxy de desarrollo: la API solo confía en
un origen reenviado si el socket ya está en loopback, así que una solicitud de
la red no puede falsificarlo.

**Exposición.** `./scripts/remote.sh open` publica la interfaz en tu red.
Es mejor acceder al estudio mediante Tailscale o detrás de un proxy inverso con
contraseña que dejar un puerto abierto. El proveedor puede conservar los
archivos multimedia generados según sus condiciones, y la creación de sitios web
puede invocar un agente de programación autenticado localmente; revisa el código
generado antes de publicarlo.

Lee [SECURITY.md](SECURITY.md) antes de exponer, modificar o redistribuir
el servicio.
- El proveedor externo puede conservar los archivos multimedia generados según
  sus condiciones.
- La creación de sitios web y documentos puede invocar un agente de programación
  autenticado localmente. Revisa el código generado antes de publicarlo.

Lee [SECURITY.md](SECURITY.md) antes de exponer, modificar o redistribuir
el servicio.

## Idioma / Language

La interfaz está disponible en **portugués (pt-BR) e inglés**. El idioma se
elige en este orden: `?lang=pt-BR` en la URL → la opción guardada en este
navegador → el idioma de tu navegador → pt-BR. Usa el botón **PT/EN** a la
derecha de la barra superior para cambiar cuando quieras; la opción queda guardada.

La interfaz es **bilingüe (pt-BR / en)**, con el portugués como idioma
predeterminado. Si el navegador está en otro idioma, cambia automáticamente
al inglés. El botón **PT/EN** a la derecha de la barra superior permite cambiar
el idioma en cualquier momento.

La jerga como *prompt*, *seed*, *upscale*, *engine* y *provider* se mantiene
deliberadamente en inglés: es el vocabulario que encontrarás en cualquier otra
herramienta, y puedes ver su explicación al pasar el cursor.

Los valores enviados a los modelos **no** cambian de idioma. Los submodos de
escena, los enums de parámetros y el prompt final siempre se generan en inglés,
que es el idioma en que estos modelos rinden mejor.

Las traducciones están en `src/i18n/pt-BR.js` y `src/i18n/en.js`; no se escribe
ninguna frase dentro del JSX. Para agregar un idioma, copia uno de los dos
archivos, regístralo en `src/i18n/index.jsx` y listo.

## Problemas conocidos

Estado real de la suite de pruebas en la versión 1.5.2, para que sepas qué ves
cuando `npm run test:release` no aparece completamente en verde:

| Prueba | Estado |
| --- | --- |
| `an attachment follows compatible models…` (escritorio + teléfono) | Falla. Es anterior al trabajo de i18n de este fork; el modelo que busca no se ofrece si tu catálogo es diferente. |
| `creator visual contract stays stable` (teléfono) | Falla. La referencia confirmada se capturó en macOS; en Linux se representa una tipografía distinta. |
| `invalid generation and project requests…` (`tests/api.test.mjs`) | Necesita una `FAL_KEY` activa; sin ella, el modelo que evalúa informa «unavailable» antes del caso que se está probando. |
| `every workspace has no serious accessibility violations` | Pasa si se puede acceder a los proveedores. Si la mayoría de los modelos no están disponibles, las tarjetas atenuadas quedan por debajo del umbral de contraste AA. |

`npm run test:contracts`, `npm run test:mcp` y las otras 25 pruebas de extremo
a extremo pasan. Se agradecen las correcciones.

Tres limitaciones del producto, expuestas claramente:

- **Seedance 2.5 no se puede cotizar.** Cobra en «1000 tokens» según una fórmula
  que fal no publica, así que el estudio muestra el precio unitario e indica
  que el total solo se conoce después de generar. Adivinar el total antes llevó
  a mostrar $0.0214 tanto para un clip de 5 segundos como para uno de 30.
- **kie.ai ofrece cuatro modelos.** La lista se escribe manualmente porque kie
  no publica una API de precios por modelo. Veo 3.1, Sora 2, Wan y Suno existen
  allí, pero no están registrados aquí. Para agregar uno, incluye una entrada
  en `kie.models.json` y un precio en `PRICE`.
- **La pantalla Config de solo lectura está a medio terminar**; consulta la
  tabla en `docs/ACESSO-REMOTO.md`.

## Fork y licencia

Este es un fork de **[promptadvisers/bench-studio-public](https://github.com/promptadvisers/bench-studio-public)** (MIT).
Este fork agrega lo siguiente al proyecto original:

- Cuatro proveedores adicionales a fal: **Agnes AI** (costo cero), **kie.ai**,
  **Kling** (CLI oficial / OAuth) e **inemaimg** (tu propia GPU local).
- Una **contraseña opcional para el estudio** (hash scrypt) y una advertencia
  sobre la exposición en la LAN.
- La pantalla **Config**: qué claves están presentes, de dónde proviene cada una
  y qué habilita, sin enviar nunca secretos al navegador.
- La **interfaz bilingüe** descrita arriba.

Los derechos de autor del proyecto original y la [Licencia MIT](LICENSE) se
conservan sin cambios. Los errores de este fork son nuestros, no del proyecto
original: repórtalos aquí.

---

<div align="center">

**Los modelos hacen el trabajo pesado. Bench hace visible y tuya la capa que los rodea.**

</div>
