import os
import re
import logging
import asyncio
import httpx
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

FIRECRAWL_BASE = "https://api.firecrawl.dev/v1"
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
CONTACT_PATHS = ["/contato", "/contact", "/sobre", "/about", "/fale-conosco"]


async def extract_emails_from_website(url: str, client: httpx.AsyncClient) -> list[str]:
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("FIRECRAWL_API_KEY not set")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    # Tenta homepage primeiro, depois páginas de contato comuns (sem map)
    candidates = [url] + [f"{base}{p}" for p in CONTACT_PATHS]

    for page_url in candidates[:4]:
        try:
            resp = await client.post(
                f"{FIRECRAWL_BASE}/scrape",
                headers=headers,
                json={"url": page_url, "formats": ["markdown"]},
                timeout=20,
            )
            if resp.status_code >= 400:
                # Log do erro real do Firecrawl (rate limit, key inválida, etc.)
                logger.warning(
                    f"Firecrawl {resp.status_code} para {page_url}: {resp.text[:300]}"
                )
                resp.raise_for_status()
            data = resp.json()
            markdown = (
                data.get("data", {}).get("markdown", "")
                or data.get("markdown", "")
            )
            found = EMAIL_RE.findall(markdown)
            logger.info(
                f"Firecrawl {page_url}: markdown={len(markdown)} chars, "
                f"emails encontrados={len(found)}"
            )
            if found:
                return found  # Para na primeira página com resultado
        except httpx.HTTPStatusError:
            # Já logado acima
            continue
        except Exception as e:
            logger.warning(f"Firecrawl scrape error for {page_url}: {type(e).__name__}: {e}")

    return []


async def extract_emails_bulk(leads: list[dict], concurrency: int = 5) -> dict[str, str]:
    """
    Extrai emails de múltiplos leads em paralelo.
    Retorna {lead_id: email}.
    """
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        logger.error("FIRECRAWL_API_KEY ausente — enrichment desabilitado")
        return {}

    leads_with_site = [l for l in leads if l.get("website")]
    logger.info(
        f"Firecrawl: processando {len(leads_with_site)}/{len(leads)} leads "
        f"(os outros não têm website)"
    )
    if not leads_with_site:
        return {}

    semaphore = asyncio.Semaphore(concurrency)
    results: dict[str, str] = {}

    async with httpx.AsyncClient() as client:
        async def process_lead(lead: dict):
            website = lead.get("website")
            if not website:
                return
            async with semaphore:
                try:
                    emails = await extract_emails_from_website(website, client)
                    if emails:
                        results[lead["id"]] = emails[0]
                except Exception as e:
                    logger.warning(f"Failed to enrich lead {lead['id']}: {type(e).__name__}: {e}")

        await asyncio.gather(*(process_lead(l) for l in leads_with_site))

    logger.info(
        f"Firecrawl concluído: {len(results)}/{len(leads_with_site)} "
        f"leads enriquecidos com email"
    )
    return results
