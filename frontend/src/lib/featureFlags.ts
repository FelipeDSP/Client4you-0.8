/**
 * Feature flags do frontend (Vite injeta no build).
 *
 * Default: tudo OFF. Pra ligar, set a env var correspondente (no Coolify ou
 * .env de dev) e REBUILD — Vite resolve `import.meta.env.*` no build, não em
 * runtime.
 *
 * Manter em sync com flags do backend (ex: ENABLE_CAMPAIGNS no server.py).
 * Ver docs/FEATURE_FLAGS.md.
 */

/**
 * Módulo de Campanhas de Email (página, menu, dashboard cards, settings tab).
 *
 * Quando false: tudo de campanha some da UI. Quando true: volta ao estado
 * anterior. Backend tem flag análoga (`ENABLE_CAMPAIGNS`); deixar os dois
 * em estados diferentes vai gerar 404 quando UI tentar chamar endpoint
 * (frontend on + backend off) ou paginas órfãs no menu (frontend off +
 * backend on). Manter SEMPRE sincronizado.
 */
export const ENABLE_CAMPAIGNS =
  import.meta.env.VITE_ENABLE_CAMPAIGNS === "true";
