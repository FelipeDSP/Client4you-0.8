-- migration_v20_drop_segment_tags.sql
-- Remove o "etiqueta aplicada a segmento" (tabela segment_tags, do v16).
--
-- Motivo: gerava sobreposição/confusão. O modelo ficou com papéis afiados:
--   • Segmento  = lista de leads que você trabalha (com Pastas agrupando).
--   • Etiqueta  = rótulo rápido aplicado a LEADS (não a segmentos).
-- Etiqueta em segmento não agregava e foi removida.
--
-- Seguro: só apaga os VÍNCULOS segmento↔etiqueta. Não toca em tags, segmentos
-- nem leads. Idempotente (IF EXISTS).
--
-- Rode no Supabase (SQL Editor → cole → Run).

BEGIN;

DROP TABLE IF EXISTS public.segment_tags;

COMMIT;
