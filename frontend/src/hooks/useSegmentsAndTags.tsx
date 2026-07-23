import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Segmentos (pastas) + Etiquetas (tags) da Base de Leads.
 *
 * Modelo N:N (ver migration_v16): um lead pode estar em vários segmentos e ter
 * várias etiquetas; etiquetas também se aplicam a segmentos. Escopo: empresa —
 * o RLS company-scoped garante o isolamento no servidor.
 *
 * As tabelas novas ainda não estão no types.ts gerado, então acessamos via um
 * client sem checagem de nome de tabela (`sb`). É o mesmo padrão pragmático já
 * usado no resto do app (casts `as any`); o RLS é a real linha de defesa.
 */
const sb = supabase as any;

export interface Segment {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  folderId: string | null; // pasta que agrupa o segmento (null = raiz)
  createdAt: string;
  tagIds: string[]; // etiquetas aplicadas ao próprio segmento
  leadCount: number; // qtde de leads dentro do segmento
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

// Pasta que agrupa segmentos (v19). Não contém leads diretamente.
export interface Folder {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

export function useSegmentsAndTags() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const queryClient = useQueryClient();

  // ── Etiquetas ──────────────────────────────────────────────────────────
  const tagsQuery = useQuery<Tag[]>({
    queryKey: ["tags", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("tags")
        .select("id, name, color")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color }));
    },
  });

  // ── Pastas (agrupam segmentos) ───────────────────────────────────────────
  const foldersQuery = useQuery<Folder[]>({
    queryKey: ["segment-folders", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("segment_folders")
        .select("id, name, color, position")
        .eq("company_id", companyId)
        .order("position")
        .order("name");
      if (error) throw error;
      return (data || []).map((f: any) => ({ id: f.id, name: f.name, color: f.color, position: f.position ?? 0 }));
    },
  });

  // ── Segmentos (+ contagem de leads + etiquetas do segmento) ──────────────
  const segmentsQuery = useQuery<Segment[]>({
    queryKey: ["segments", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [segsRes, membersRes, segTagsRes] = await Promise.all([
        sb.from("lead_segments").select("id, name, color, description, folder_id, created_at").eq("company_id", companyId).order("name"),
        sb.from("lead_segment_members").select("segment_id").eq("company_id", companyId),
        sb.from("segment_tags").select("segment_id, tag_id").eq("company_id", companyId),
      ]);
      if (segsRes.error) throw segsRes.error;

      const counts: Record<string, number> = {};
      for (const m of membersRes.data || []) counts[m.segment_id] = (counts[m.segment_id] || 0) + 1;

      const segTags: Record<string, string[]> = {};
      for (const st of segTagsRes.data || []) (segTags[st.segment_id] ||= []).push(st.tag_id);

      return (segsRes.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        description: s.description,
        folderId: s.folder_id ?? null,
        createdAt: s.created_at,
        tagIds: segTags[s.id] || [],
        leadCount: counts[s.id] || 0,
      }));
    },
  });

  // ── Mapas por lead (pra exibir chips na tabela) ──────────────────────────
  const leadSegmentsQuery = useQuery<Record<string, string[]>>({
    queryKey: ["lead-segments-map", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("lead_segment_members")
        .select("lead_id, segment_id")
        .eq("company_id", companyId);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of data || []) (map[r.lead_id] ||= []).push(r.segment_id);
      return map;
    },
  });

  const leadTagsQuery = useQuery<Record<string, string[]>>({
    queryKey: ["lead-tags-map", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("lead_tags")
        .select("lead_id, tag_id")
        .eq("company_id", companyId);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of data || []) (map[r.lead_id] ||= []).push(r.tag_id);
      return map;
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["segments", companyId] });
    queryClient.invalidateQueries({ queryKey: ["segment-folders", companyId] });
    queryClient.invalidateQueries({ queryKey: ["tags", companyId] });
    queryClient.invalidateQueries({ queryKey: ["lead-segments-map", companyId] });
    queryClient.invalidateQueries({ queryKey: ["lead-tags-map", companyId] });
  };

  // ── Mutations: pastas ────────────────────────────────────────────────────
  const createFolder = useMutation({
    mutationFn: async (input: { name: string; color?: string | null }) => {
      const { data, error } = await sb
        .from("segment_folders")
        .insert({ company_id: companyId, name: input.name.trim(), color: input.color || null, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateAll,
  });

  const updateFolder = useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string | null }) => {
      const patch: any = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.color !== undefined) patch.color = input.color;
      const { error } = await sb.from("segment_folders").update(patch).eq("id", input.id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      // ON DELETE SET NULL no folder_id: os segmentos voltam pra raiz, não são apagados.
      const { error } = await sb.from("segment_folders").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  // Move um segmento pra dentro de uma pasta (ou pra raiz com folderId = null).
  const moveSegmentToFolder = useMutation({
    mutationFn: async (input: { segmentId: string; folderId: string | null }) => {
      const { error } = await sb
        .from("lead_segments")
        .update({ folder_id: input.folderId, updated_at: new Date().toISOString() })
        .eq("id", input.segmentId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  // ── Mutations: segmentos ─────────────────────────────────────────────────
  const createSegment = useMutation({
    mutationFn: async (input: { name: string; color?: string | null; description?: string | null }) => {
      const { data, error } = await sb
        .from("lead_segments")
        .insert({
          company_id: companyId,
          name: input.name.trim(),
          color: input.color || null,
          description: input.description || null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateAll,
  });

  const updateSegment = useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string | null; description?: string | null }) => {
      const patch: any = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.color !== undefined) patch.color = input.color;
      if (input.description !== undefined) patch.description = input.description;
      const { error } = await sb.from("lead_segments").update(patch).eq("id", input.id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("lead_segments").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  // ── Mutations: etiquetas ─────────────────────────────────────────────────
  const createTag = useMutation({
    mutationFn: async (input: { name: string; color: string }) => {
      const { data, error } = await sb
        .from("tags")
        .insert({ company_id: companyId, name: input.name.trim(), color: input.color, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidateAll,
  });

  const updateTag = useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string }) => {
      const patch: any = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.color !== undefined) patch.color = input.color;
      const { error } = await sb.from("tags").update(patch).eq("id", input.id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("tags").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  // ── Vínculos: lead ↔ segmento ────────────────────────────────────────────
  const addLeadsToSegment = useMutation({
    mutationFn: async (input: { segmentId: string; leadIds: string[] }) => {
      if (input.leadIds.length === 0) return;
      const rows = input.leadIds.map((lead_id) => ({ segment_id: input.segmentId, lead_id, company_id: companyId }));
      const { error } = await sb.from("lead_segment_members").upsert(rows, { onConflict: "segment_id,lead_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const removeLeadsFromSegment = useMutation({
    mutationFn: async (input: { segmentId: string; leadIds: string[] }) => {
      if (input.leadIds.length === 0) return;
      const { error } = await sb
        .from("lead_segment_members")
        .delete()
        .eq("segment_id", input.segmentId)
        .eq("company_id", companyId)
        .in("lead_id", input.leadIds);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  // ── Vínculos: lead ↔ etiqueta ────────────────────────────────────────────
  const addTagToLeads = useMutation({
    mutationFn: async (input: { tagId: string; leadIds: string[] }) => {
      if (input.leadIds.length === 0) return;
      const rows = input.leadIds.map((lead_id) => ({ tag_id: input.tagId, lead_id, company_id: companyId }));
      const { error } = await sb.from("lead_tags").upsert(rows, { onConflict: "tag_id,lead_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const removeTagFromLeads = useMutation({
    mutationFn: async (input: { tagId: string; leadIds: string[] }) => {
      if (input.leadIds.length === 0) return;
      const { error } = await sb
        .from("lead_tags")
        .delete()
        .eq("tag_id", input.tagId)
        .eq("company_id", companyId)
        .in("lead_id", input.leadIds);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  // ── Vínculo: etiqueta ↔ segmento ─────────────────────────────────────────
  const setSegmentTag = useMutation({
    mutationFn: async (input: { segmentId: string; tagId: string; on: boolean }) => {
      if (input.on) {
        const { error } = await sb.from("segment_tags").upsert(
          [{ segment_id: input.segmentId, tag_id: input.tagId, company_id: companyId }],
          { onConflict: "tag_id,segment_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("segment_tags")
          .delete()
          .eq("segment_id", input.segmentId)
          .eq("tag_id", input.tagId)
          .eq("company_id", companyId);
        if (error) throw error;
      }
    },
    onSuccess: invalidateAll,
  });

  return {
    segments: segmentsQuery.data || [],
    folders: foldersQuery.data || [],
    tags: tagsQuery.data || [],
    leadSegments: leadSegmentsQuery.data || {}, // leadId -> segmentId[]
    leadTags: leadTagsQuery.data || {}, // leadId -> tagId[]
    isLoading: segmentsQuery.isLoading || tagsQuery.isLoading,

    createSegment: createSegment.mutateAsync,
    updateSegment: updateSegment.mutateAsync,
    deleteSegment: deleteSegment.mutateAsync,
    createFolder: createFolder.mutateAsync,
    updateFolder: updateFolder.mutateAsync,
    deleteFolder: deleteFolder.mutateAsync,
    moveSegmentToFolder: moveSegmentToFolder.mutateAsync,
    createTag: createTag.mutateAsync,
    updateTag: updateTag.mutateAsync,
    deleteTag: deleteTag.mutateAsync,

    addLeadsToSegment: addLeadsToSegment.mutateAsync,
    removeLeadsFromSegment: removeLeadsFromSegment.mutateAsync,
    addTagToLeads: addTagToLeads.mutateAsync,
    removeTagFromLeads: removeTagFromLeads.mutateAsync,
    setSegmentTag: setSegmentTag.mutateAsync,
  };
}
