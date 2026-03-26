# KRONOS (Estado Público de Investigación)

Repositorio abierto con el estado actual de KRONOS: un prototipo de análisis forense para estimar riesgo de manipulación/síntesis en imagen y vídeo.

Este README es deliberadamente sincero. El objetivo es dejar trazabilidad de lo que se intentó, qué se consiguió y qué límites siguen abiertos.

---

## 1) Qué es KRONOS

KRONOS combina señales heterogéneas y las agrega con un ensemble:

- Señales forenses visuales (ELA, frecuencia, textura, bordes, ruido, ROI cara/fondo).
- Señales biométricas en vídeo (estabilidad de landmarks, parpadeo, jitter de máscara).
- Señales físicas en vídeo (rPPG sobre canal verde en ROI de mejillas).
- Señales de contenedor MP4 (estructura de boxes y pistas de empaquetado/transcodificación).
- Señales de metadatos (origen no verificable y software de terceros cuando aplica).

Resultado: `riskScore` (0-100), `verdict` y votos por especialista (`ensembleVotes`) para explicar la decisión.

---

## 2) Qué se implementó

Piezas relevantes en el código actual:

- `src/lib/ensemble/EnsembleManager.ts`
  - Agregación ponderada por especialistas.
  - Pesos por defecto y boosts de convergencia para vídeo.
  - Analistas: `forensic`, `biometric`, `rppg`, `container`, `metadata`, `acoustic`, `linguistic`.

- `src/lib/forensics/AdvancedForensicSuite.ts`
  - Contratos de entrada para señales avanzadas (rPPG + MP4).

- `src/lib/forensics/rppgSignal.ts`
  - Cálculo de señal rPPG (estimación de pulso plausible vs ausencia de pulso claro).

- `src/lib/forensics/mp4BoxForensics.ts`
  - Escaneo básico de integridad estructural del contenedor MP4.

- `src/lib/components/Scanner/VideoProcessor.svelte`
  - Muestreo de ROI, extracción de features y export de señales para evaluación.

- `scripts/replay-ensemble.ts`
  - Recalcula `riskScore` y `ensembleVotes` sobre sidecars `*.kronos.json`.

- `tests/dataset/*/*.kronos.json`
  - Sidecars de dataset local usado para iteración de reglas y calibración inicial.

---

## 3) Qué problema intentó resolver

Reducir el caso de "vídeo/foto de IA pulida que pasa por real" sin depender de una única heurística.

Estrategia seguida:

- Pasar de reglas aisladas a ensemble multi-señal.
- Añadir señales de distinta naturaleza (forense visual, biométrica, física y contenedor).
- Ajustar reglas para evitar que una única pista dé un veredicto fuerte por sí sola.

---

## 4) Qué sí funciona razonablemente

- Detección de ciertos contenidos sintéticos con señales múltiples coherentes.
- Mejor trazabilidad de decisiones gracias a votos por especialista.
- Mejor cobertura en vídeo al incorporar rPPG y análisis de contenedor MP4.
- Flujo reproducible de replay con sidecars para comparar cambios de scoring.

---

## 5) Límites y problemas reales (sin maquillaje)

1. No existe "infalible" en este dominio.
   - Siempre hay trade-off entre falsos positivos y falsos negativos.

2. Hay falsos positivos en material real, sobre todo en fotos/vídeos legacy.
   - Recompresión social, móviles antiguos, iluminación difícil y artefactos JPEG pueden parecer señales sintéticas.

3. Heurísticas fuertes pueden sobrerreaccionar fuera de su contexto.
   - Una regla útil en cierto tipo de fake puede penalizar indebidamente contenido auténtico.

4. El sistema no es prueba forense/legal.
   - Es un estimador de riesgo técnico, no un veredicto de autenticidad judicial.

5. Falta calibración amplia con dataset representativo y etiquetado robusto.
   - Sin eso, cualquier peso/umbral sigue siendo parcialmente artesanal.

---

## 6) Estado de precisión y expectativas

Este repositorio refleja una fase de I+D, no un detector terminado para producción crítica.

Si se usa, debe comunicarse así:

- "señales de riesgo" y "revisión recomendada",
- no "esta imagen es falsa" como afirmación absoluta.

---

## 7) Seguridad y secretos

Revisión básica del repositorio (archivos y patrones típicos de credenciales):

- No se han encontrado `.env` reales versionados.
- Existe `.env.example` con placeholders (correcto).
- `.gitignore` ignora `.env` y variantes (salvo excepciones explícitas de ejemplo/test).
- No aparecen tokens evidentes de proveedores comunes en archivos rastreados.

Importante:

- Esta revisión es de superficie (patrones conocidos).
- Antes de publicar definitivamente, conviene un escaneo dedicado de secretos en GitHub (Secret Scanning / push protection si aplica).

---

## 8) Cómo ejecutar localmente (modo actual)

Requisitos:

- Node.js 18+ (recomendado 20+).

Comandos:

```bash
npm install
npm run dev
```

Chequeo de tipos:

```bash
npm run check
```

Replay de sidecars:

```bash
npm run replay:ensemble
```

Con imputación conservadora de features de vídeo cuando falten:

```bash
npm run replay:ensemble:impute-video
```

---

## 9) Decisión de producto para este repositorio

Este repo se publica como estado abierto de KRONOS, con enfoque de documentación y aprendizaje:

- qué se probó,
- qué señales se combinaron,
- dónde funcionó mejor,
- dónde falló (incluidos falsos positivos).

No se mantiene la promesa de detección perfecta.

---

## 10) Próximo paso recomendado (fuera de este repo)

Continuar en una nueva repo con nuevo nombre y nuevo posicionamiento:

- detector de riesgo asistido, no "detector infalible",
- métricas objetivo explícitas (FP/FN por escenario),
- dataset de calibración más amplio (especialmente material real legacy),
- umbrales y pesos gobernados por evaluación, no por intuición aislada.

---

## 11) Licencia y uso responsable

Pendiente de la licencia final que decida el autor del proyecto.

Mientras tanto, se recomienda tratar este código como prototipo experimental y no usarlo para decisiones con impacto legal o reputacional sin validación adicional independiente.
