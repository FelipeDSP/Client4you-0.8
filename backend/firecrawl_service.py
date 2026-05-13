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
            resp.raise_for_status()
            data = resp.json()
            markdown = (
                data.get("data", {}).get("markdown", "")
                or data.get("markdown", "")
            )
            found = EMAIL_RE.findall(markdown)
            if found:
                return found  # Para na primeira página com resultado
        except Exception as e:
            logger.debug(f"Firecrawl scrape error for {page_url}: {e}")

    return []


async def extract_emails_bulk(leads: list[dict], concurrency: int = 5) -> dict[str, str]:
    """
    Extrai emails de múltiplos leads em paralelo.
    Retorna {lead_id: email}.
    """
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
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
                    logger.warning(f"Failed to enrich lead {lead['id']}: {e}")

        await asyncio.gather(*(process_lead(l) for l in leads))

    return results
