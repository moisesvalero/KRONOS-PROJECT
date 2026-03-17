## NovaKit SvelteKit Starter

Plantilla base para crear **landings** y **UIs de producto** modernas con **SvelteKit 2 + Svelte 5 + TypeScript**.

- Home mínima muy sencilla, pensada como **punto de partida limpio**.
- Ruta de ejemplo con una **landing completa** para inspirarte y copiar patrones.
- Colección de **componentes UI genéricos** listos para reutilizar.

Está pensada para que **también alguien que nunca ha usado SvelteKit** pueda arrancar paso a paso.

---

## 1. Qué necesitas antes de empezar

- **Node.js 18 o superior**  
  - Descarga desde la web oficial (`https://nodejs.org`) e instala con las opciones por defecto.
  - Después de instalar, en una terminal ejecuta:

    ```bash
    node -v
    npm -v
    ```

    Si ves dos versiones (por ejemplo `v20.x` y `10.x`), estás listo.

- **Git (opcional pero recomendado)**  
  - Sirve para clonar esta plantilla y versionar cambios.

No necesitas conocer Svelte ni SvelteKit de antemano: esta plantilla ya trae una estructura funcional.

---

## 2. Cómo crear un proyecto nuevo desde esta plantilla

Tienes dos formas típicas de usarla.

### Opción A: Clonar el repositorio (recomendada para desarrollo propio)

1. Abre una terminal.
2. Ve a la carpeta donde quieras guardar el proyecto:

   ```bash
   cd ruta/donde/guardar
   ```

3. Clona el repositorio (cambia la URL por la de tu repo si es distinta):

   ```bash
   git clone <URL_DE_ESTE_REPO> mi-nueva-app
   cd mi-nueva-app
   ```

4. Instala dependencias e inicia el servidor:

   ```bash
   npm install
   npm run dev
   ```

5. Abre el navegador en `http://localhost:5173` (o la URL que muestre la terminal).

### Opción B: Descargar ZIP

1. Descarga el ZIP del repositorio desde la interfaz de GitHub (o similar).
2. Descomprime el ZIP en una carpeta, por ejemplo `mi-nueva-app`.
3. Abre una terminal en esa carpeta:

   ```bash
   cd ruta/mi-nueva-app
   npm install
   npm run dev
   ```

Con esto ya tendrás la plantilla funcionando en local.

---

## 3. Comandos básicos que vas a usar

Todos se ejecutan desde la carpeta del proyecto.

- **Arrancar en desarrollo**:

  ```bash
  npm run dev
  ```

- **Abrir el navegador automáticamente**:

  ```bash
  npm run dev -- --open
  ```

- **Comprobar el proyecto (errores de tipos y Svelte)**:

  ```bash
  npm run check
  ```

- **Generar la build de producción**:

  ```bash
  npm run build
  ```

- **Probar la build de producción en local**:

  ```bash
  npm run preview
  ```

Si alguno de estos comandos falla con algo como `svelte-kit no se reconoce`, asegúrate de haber hecho `npm install` correctamente y de estar ejecutándolos dentro de la carpeta del proyecto.

---

## 4. Estructura del proyecto (visión rápida)

Las rutas y componentes más importantes:

- `src/routes`
  - `+layout.svelte` – Layout principal (cabecera, navegación, cambio de idioma, estilos globales).
  - `+page.svelte` – **Home mínima del starter** (ejemplo sencillo con hero + features).
  - `examples/landing/+page.svelte` – **Landing completa de demostración** basada en NovaKit.

- `src/lib`
  - `components/ui` – **Componentes base reutilizables** (botones, secciones, hero genérico, etc.).
  - `components` – Componentes avanzados y específicos usados en la landing de ejemplo.
  - `examples/landing` – Exports agrupados de los componentes de landing de ejemplo.
  - `i18n` – Sistema simple de traducciones (ES/EN).
  - `reveal.ts` – Acción de Svelte para animaciones al hacer scroll.

Como regla mental:

- `components/ui` → bloques genéricos para cualquier proyecto.
- `routes/+page.svelte` → tu página principal.
- `routes/examples/landing` → solo ejemplo/demostración, no es obligatorio mantenerlo en tu producto final.

---

## 5. Componentes base (`src/lib/components/ui`)

Estos son los bloques esenciales para construir tus propias pantallas. Todos son **autónomos**, escritos en TypeScript y **no traen textos de marketing fijos**.

- **`Container.svelte`**  
  Contenedor centrado con `max-width` y padding horizontal responsivo.

- **`Section.svelte`**  
  Wrapper de sección con variantes de fondo:
  - `variant="default" | "muted" | "soft" | "surface"`

- **`Button.svelte`**  
  Botón reutilizable con variantes y tamaños:
  - `variant="primary" | "secondary" | "ghost" | "outline" | "link"`
  - `size="sm" | "md" | "lg"`
  - Acepta `as="button" | "a"` y `href` para funcionar como enlace o botón.

- **`Heading.svelte`**  
  Encabezado tipográfico con soporte para eyebrow y kicker:
  - `level={1 | 2 | 3 | 4}`
  - `align="left" | "center" | "right"`
  - Props opcionales `eyebrow` y `kicker`.

- **`Text.svelte`**  
  Texto genérico:
  - `variant="body" | "muted" | "small" | "label"`
  - `align="left" | "center" | "right"`

- **`Card.svelte`**  
  Tarjeta con variantes:
  - `variant="default" | "soft" | "outline"`
  - `clickable={true | false}`
  - Slots opcionales: `eyebrow`, `title`, `footer`.

- **`Grid.svelte`**  
  Wrapper para `display: grid` con clases auxiliares responsivas (`.nk-grid-cols-*`).

- **`HeroSection.svelte`**  
  Hero genérico para páginas de producto:
  - `eyebrow`, `title`, `subtitle`
  - `primaryLabel`, `primaryHref`
  - `secondaryLabel`, `secondaryHref`
  - `align="left" | "center"`
  - Slot para `media` (imágenes, iframes, etc.).

- **`FeaturesSection.svelte`**  
  Sección de features en cuadrícula:
  - `eyebrow`, `title`, `subtitle`
  - `items: { icon?: string; title: string; description: string }[]`
  - `id` para ancla (ej. `"features"`).

---

## 6. Tu primer cambio: adaptar la home mínima

La home vive en `[src/routes/+page.svelte](src/routes/+page.svelte)` y usa solo componentes `ui`. Es el lugar más fácil para empezar.

- **Paso 1 – Cambia el texto del hero**
  - Edita las props de `HeroSection`:
    - `eyebrow`: texto pequeño encima del título (por ejemplo, el tipo de producto).
    - `title`: el mensaje principal de tu producto.
    - `subtitle`: una frase corta explicando qué hace.

- **Paso 2 – Ajusta las CTAs**
  - Cambia `primaryLabel` y `secondaryLabel` para reflejar tus acciones (por ejemplo: “Empezar gratis”, “Ver documentación”).
  - Actualiza `primaryHref` y `secondaryHref` con las rutas reales que quieras usar.

- **Paso 3 – Actualiza las features**
  - En el array `items` de `FeaturesSection`, edita:
    - `icon`: puedes usar emojis o dejarlo vacío.
    - `title`: el beneficio principal.
    - `description`: breve explicación.

Con solo estos tres pasos tendrás una primera versión de tu landing funcionando.

---

## 7. Usar la landing de ejemplo completa

La ruta `[src/routes/examples/landing/+page.svelte](src/routes/examples/landing/+page.svelte)` monta la **landing completa original**:

- Hero avanzado con animaciones y Spline.
- Secciones de social proof, workflow, gallery, use cases, superpowers, pricing, testimonials, detalles y FAQ.

Puedes usarla para:

- Ver cómo se organiza una página más grande en SvelteKit.
- Copiar secciones concretas que te gusten a tus propias rutas.
- Tomar ideas de motion y composición.

Si tu proyecto final no debe mencionar NovaKit, tienes dos opciones:

1. Reutilizar solo los componentes de `components/ui` y construir tus pantallas encima.
2. Copiar componentes concretos desde `src/lib/components` a otra carpeta, cambiar textos/estilos y usarlos como base.

---

## 8. i18n y textos

El proyecto trae un sistema de traducciones simple **ES/EN**:

- `src/lib/i18n/index.js` – Store de idioma y helper `t` para traducir.
- `src/lib/i18n/en.json` y `src/lib/i18n/es.json` – Textos en inglés y español.

Cómo funciona, a muy alto nivel:

- En los componentes verás cosas como `{$t('hero.subtitle')}`.
- Esa clave se busca en los JSON de `en` y `es`.
- El idioma actual se gestiona con un store y un botón en el layout.

Para empezar, no necesitas tocar esto. Más adelante puedes:

- Añadir nuevas claves para tus propios textos.
- Traducir solo lo que quieras mantener en varios idiomas.

---

## 9. Cómo adaptar la plantilla a tu marca

1. **Colores y tipografía**  
   - Abre tus estilos globales (`app.css`).  
   - Busca variables como `--accent`, `--text-main`, `--text-secondary` y ajústalas a tu paleta.
   - Cambia la fuente base si lo necesitas (familia tipográfica, tamaños, etc.).

2. **Home**  
   - Adapta textos del hero y las features.
   - Elimina o añade secciones según lo que necesite tu producto.

3. **Secciones avanzadas**  
   - Ve a `src/lib/components` y localiza la sección que te interese (pricing, FAQ, etc.).
   - Copia el componente a otra carpeta (por ejemplo `src/lib/components/mi-proyecto`) y cambia copy/estilos sin miedo.

4. **Contenido y datos**  
   - Sustituye números, nombres de empresa y ejemplos por datos reales de tu producto.

---

## 10. Buenas prácticas sugeridas

- Usa `src/lib/components/ui` para todos los bloques base y compón sobre ellos.
- Mantén secciones muy específicas de cada proyecto en carpetas tipo `src/lib/components/tu-proyecto` o `src/lib/examples`.
- Evita meter textos de marketing dentro de los componentes base: pasa los textos mediante **props** o **i18n**.

Con esto tienes una base lista para construir **starters reutilizables** y landings de producto modernas sobre SvelteKit, incluso si es tu primera vez trabajando con este framework.
