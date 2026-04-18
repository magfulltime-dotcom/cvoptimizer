# CV Optimizer — por @aletrabajaonline

App para analizar y adaptar CVs al mercado remoto internacional.

## Deploy en Vercel (paso a paso)

### Paso 1 — Crear cuenta en Vercel
1. Andá a [vercel.com](https://vercel.com)
2. Registrate con GitHub (si no tenés GitHub, creá una cuenta en github.com primero — es gratis)

### Paso 2 — Subir el proyecto a GitHub
1. Andá a [github.com](https://github.com) → New repository
2. Nombre: `cvoptimizer` → Create repository
3. Subí todos los archivos de esta carpeta arrastrándolos al repo

### Paso 3 — Conectar con Vercel
1. En Vercel → "Add New Project"
2. Conectá tu repositorio de GitHub `cvoptimizer`
3. Dejá todo por defecto → Deploy

### Paso 4 — Agregar la API Key de Anthropic
1. En Vercel → tu proyecto → Settings → Environment Variables
2. Agregá:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** tu API key (la conseguís en console.anthropic.com)
3. Guardá → Settings → Redeploy

### Paso 5 — Listo
Tu app va a estar en: `https://cvoptimizer.vercel.app` (o similar)

## Estructura del proyecto

```
cvoptimizer/
├── api/
│   └── analyze.js      ← Backend serverless (oculta la API key)
├── public/
│   └── index.html      ← La app frontend
├── vercel.json         ← Configuración de rutas
├── package.json        ← Config del proyecto
└── README.md           ← Este archivo
```

## Costos estimados

- Vercel: **gratis** (plan hobby)
- Anthropic API: ~$0.003 por análisis
  - 100 análisis/mes = ~$0.30 USD
  - 1000 análisis/mes = ~$3 USD

## Monetización sugerida

- Plan gratuito: 2 análisis por mes
- Plan pago: $9-15 USD/mes, análisis ilimitados
- Para implementar límites necesitás agregar autenticación (siguiente paso)
