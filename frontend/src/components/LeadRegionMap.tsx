import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Vite resolve esses imports pra URLs dos assets — necessário porque o ícone
// padrão do Leaflet aponta pra caminhos relativos que quebram sob bundler.
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapPin, Loader2 } from "lucide-react";

// Ícone do pin criado uma vez (reusado por todos os marcadores).
const leadIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface GeoResult {
  lat: number;
  lon: number;
  // Nominatim devolve [south, north, west, east] (como strings) → convertido pra number.
  boundingbox: [number, number, number, number];
  displayName: string;
}

// Cache em memória: evita re-bater no Nominatim pra mesma localização durante a
// sessão (a política de uso deles pede parcimônia — 1 req/s, sem uso pesado).
const geocodeCache = new Map<string, GeoResult | null>();

async function geocode(location: string): Promise<GeoResult | null> {
  const key = location.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0" +
      `&q=${encodeURIComponent(location)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      geocodeCache.set(key, null);
      return null;
    }

    const item = data[0];
    const bb = (item.boundingbox || []).map(Number) as number[];
    const result: GeoResult = {
      lat: Number(item.lat),
      lon: Number(item.lon),
      boundingbox: [bb[0], bb[1], bb[2], bb[3]],
      displayName: item.display_name || location,
    };
    geocodeCache.set(key, result);
    return result;
  } catch {
    // Falha de rede/geocode não deve quebrar a busca — só não mostra o mapa.
    return null;
  }
}

interface LeadPin {
  name?: string;
  lat?: number | null;
  lng?: number | null;
}

interface LeadRegionMapProps {
  /** Texto de localização que foi buscado (ex: "São Paulo, SP") — fallback do centro. */
  location: string;
  /** Leads da busca. Os que têm lat/lng viram pins; o mapa enquadra todos. */
  leads?: LeadPin[];
  /** Nº de leads encontrados — exibido como badge. */
  count?: number;
}

function isValidCoord(lat?: number | null, lng?: number | null): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    // (0,0) quase sempre é coordenada faltando, não a Ilha Null real.
    !(lat === 0 && lng === 0)
  );
}

/**
 * Mini-mapa 2D da busca com UM PIN POR LEAD (coordenada real da fonte —
 * DataForSEO/Scrappa). Quando nenhum lead tem coordenada, cai no geocode da
 * região (Nominatim). Leaflet + OpenStreetMap — grátis, sem API key.
 */
export function LeadRegionMap({ location, leads, count }: LeadRegionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  // Assinatura do último conjunto plotado — evita re-desenhar/re-enquadrar quando
  // só mudam campos irrelevantes pro mapa (ex: email preenchido pelo enrichment).
  const lastPlotRef = useRef<string>("");
  const [status, setStatus] = useState<"loading" | "pins" | "region" | "notfound">(
    "loading"
  );

  // Inicializa o mapa uma única vez.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false, // evita zoom acidental ao rolar a página
    }).setView([-14.235, -51.925], 3); // Brasil como estado inicial

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Plota pins (coord real) ou cai no geocode da região.
  useEffect(() => {
    let cancelled = false;
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;

    const pins = (leads || []).filter((l) => isValidCoord(l.lat, l.lng));

    // Só re-plota quando o conjunto de coordenadas (ou a região de fallback)
    // realmente muda. Enrichment atualiza `leads` (email) sem mexer em coord —
    // sem esse guard o mapa re-enquadraria a cada tick e fecharia popups.
    const plotKey =
      pins.length > 0
        ? "pins:" + pins.map((p) => `${p.lat},${p.lng}`).join("|")
        : "region:" + (location || "").trim().toLowerCase();
    if (plotKey === lastPlotRef.current) return;
    lastPlotRef.current = plotKey;

    // ── Caminho preferido: pins reais de cada lead ──
    if (pins.length > 0) {
      markers.clearLayers();
      const latlngs: L.LatLngExpression[] = [];
      for (const p of pins) {
        const latlng: L.LatLngExpression = [p.lat as number, p.lng as number];
        latlngs.push(latlng);
        const marker = L.marker(latlng, { icon: leadIcon });
        if (p.name) marker.bindPopup(p.name);
        marker.addTo(markers);
      }
      map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30], maxZoom: 16 });
      setTimeout(() => map.invalidateSize(), 120);
      setStatus("pins");
      return;
    }

    // ── Fallback: sem coordenadas → geocodifica a região buscada ──
    markers.clearLayers();
    const loc = (location || "").trim();
    if (!loc) return;

    setStatus("loading");
    geocode(loc).then((res) => {
      if (cancelled || !mapRef.current) return;
      if (!res || !Number.isFinite(res.lat) || !Number.isFinite(res.lon)) {
        setStatus("notfound");
        return;
      }
      L.marker([res.lat, res.lon], { icon: leadIcon }).addTo(markers);
      const [s, n, w, e] = res.boundingbox;
      if ([s, n, w, e].every(Number.isFinite)) {
        map.fitBounds(
          [
            [s, w],
            [n, e],
          ],
          { padding: [24, 24], maxZoom: 13 }
        );
      } else {
        map.setView([res.lat, res.lon], 12);
      }
      setTimeout(() => map.invalidateSize(), 120);
      setStatus("region");
    });

    return () => {
      cancelled = true;
    };
  }, [leads, location]);

  const headerText =
    status === "loading"
      ? "Localizando região..."
      : status === "notfound"
      ? `Não localizei "${location}" no mapa`
      : status === "pins"
      ? `${location} — ${count ?? 0} ${count === 1 ? "lead no mapa" : "leads no mapa"}`
      : `Região da busca: ${location}`;

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
      <div ref={containerRef} className="h-[280px] w-full" style={{ zIndex: 0 }} />

      {/* Header sobreposto (não bloqueia interação com o mapa) */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center gap-2 bg-gradient-to-b from-black/55 to-transparent px-4 py-3 text-white text-sm pointer-events-none"
        style={{ zIndex: 500 }}
      >
        <MapPin className="h-4 w-4 shrink-0" />
        <span className="font-medium truncate">{headerText}</span>
        {status === "pins" && typeof count === "number" && count > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs">
            {count} {count === 1 ? "lead" : "leads"}
          </span>
        )}
      </div>

      {status === "loading" && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-white/40"
          style={{ zIndex: 501 }}
        >
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
