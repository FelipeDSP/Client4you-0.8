import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  query: string;
  location: string;
  companyId: string;
  searchId: string;
  start?: number;
}

interface SerpAPIResult {
  place_id: string;
  title: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  type?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: SearchRequest = await req.json();
    const { query, location, companyId, searchId, start = 0 } = body;

    if (!query || !location || !companyId || !searchId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile || userProfile.company_id !== companyId) {
      console.warn('Authorization violation attempt detected');
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const maxQueryLength = 200;
    const maxLocationLength = 100;

    if (typeof query !== 'string' || typeof location !== 'string') {
      return new Response(
        JSON.stringify({ error: "Query and location must be strings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (query.length > maxQueryLength || location.length > maxLocationLength) {
      return new Response(
        JSON.stringify({ error: `Query must be under ${maxQueryLength} characters and location under ${maxLocationLength} characters` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitizedQuery = query.trim().replace(/[^a-zA-Z0-9\s.,\-'áéíóúàèìòùâêîôûãõçñÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇÑ]/gi, '');
    const sanitizedLocation = location.trim().replace(/[^a-zA-Z0-9\s.,\-'áéíóúàèìòùâêîôûãõçñÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇÑ]/gi, '');

    if (!sanitizedQuery || !sanitizedLocation) {
      return new Response(
        JSON.stringify({ error: "Query and location cannot be empty after sanitization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sqlPattern = /(union\s+select|insert\s+into|update\s+.+\s+set|delete\s+from|drop\s+table|exec\s*\(|script\s*>)/i;
    if (sqlPattern.test(query) || sqlPattern.test(location)) {
      console.warn("Potential SQL injection attempt detected");
      return new Response(
        JSON.stringify({ error: "Invalid input detected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // company_settings só tem serpapi_key na DB atual.
    const { data: settings, error: settingsError } = await supabase
      .from("company_settings")
      .select("serpapi_key")
      .eq("company_id", companyId)
      .maybeSingle();

    if (settingsError) {
      console.error("settings error:", settingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch company settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serpapiKey = settings?.serpapi_key;
    let leads: any[] = [];
    let hasMore = false;

    if (serpapiKey) {
      console.log(`Using SerpAPI for search... (Start: ${start})`);

      const searchQuery = `${sanitizedQuery} em ${sanitizedLocation}`;
      const serpApiUrl = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(searchQuery)}&api_key=${serpapiKey}&hl=pt-br&gl=br&start=${start}`;

      try {
        const serpResponse = await fetch(serpApiUrl);
        const serpData = await serpResponse.json();

        if (serpData.error) {
          console.error("SerpAPI error:", serpData.error);
          const errorMessage = String(serpData.error).toLowerCase();
          let clientError = "Search service temporarily unavailable";
          let statusCode = 503;

          if (errorMessage.includes('api key') || errorMessage.includes('invalid') || errorMessage.includes('unauthorized')) {
            clientError = "Search service configuration error. Please contact support.";
            statusCode = 500;
          } else if (errorMessage.includes('rate') || errorMessage.includes('limit') || errorMessage.includes('quota')) {
            clientError = "Search rate limit reached. Please try again later.";
            statusCode = 429;
          }

          return new Response(
            JSON.stringify({ error: clientError }),
            { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        hasMore = !!serpData.serpapi_pagination?.next;
        const localResults = serpData.local_results || [];

        const { data: existingLeads } = await supabase
          .from("leads")
          .select("name")
          .eq("search_id", searchId);

        const existingNames = new Set((existingLeads || []).map((l: { name: string | null }) => (l.name || "").toLowerCase().trim()));

        const uniqueLocalResults = localResults.filter((result: SerpAPIResult) =>
          !existingNames.has((result.title || "").toLowerCase().trim())
        );

        console.log(`API trouxe ${localResults.length} leads. Após deduplicação sobraram: ${uniqueLocalResults.length}`);

        leads = uniqueLocalResults.map((result: SerpAPIResult) => ({
          name: result.title,
          phone: result.phone || null,
          has_whatsapp: false,
          email: null,
          has_email: false,
          address: result.address,
          category: result.type || query,
          rating: result.rating || null,
          reviews_count: result.reviews || 0,
          website: result.website || null,
          company_id: companyId,
          search_id: searchId,
        }));
      } catch (serpError) {
        console.error("SerpAPI fetch failed:", serpError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch from SerpAPI" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.log(`No SerpAPI key configured, using mock data for start=${start}...`);
      const mockCount = 20;
      const categories = [query, `${query} Premium`, `${query} Express`];
      const streets = ["Rua das Flores", "Av. Brasil", "Rua São Paulo", "Av. Paulista", "Rua Augusta"];

      hasMore = start < 40;

      if (hasMore) {
        leads = Array.from({ length: mockCount }, (_, i) => ({
          name: `${query} ${location} (Pg ${Math.floor(start / 20) + 1}) #${i + 1}`,
          phone: `(11) 9${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
          has_whatsapp: false,
          email: null,
          has_email: false,
          address: `${streets[Math.floor(Math.random() * streets.length)]}, ${Math.floor(100 + Math.random() * 2000)} - ${location}`,
          category: categories[Math.floor(Math.random() * categories.length)],
          rating: parseFloat((3 + Math.random() * 2).toFixed(1)),
          reviews_count: Math.floor(10 + Math.random() * 500),
          website: null,
          company_id: companyId,
          search_id: searchId,
        }));
      }
    }

    if (leads.length > 0) {
      const { error: insertError } = await supabase.from("leads").insert(leads);
      if (insertError) {
        console.error("Error inserting leads:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save leads" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: leads.length,
        usedRealApi: Boolean(serpapiKey),
        hasMore,
        nextStart: hasMore ? start + 20 : 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
