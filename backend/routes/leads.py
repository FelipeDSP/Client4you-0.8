import logging
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Request, Depends
from security_utils import get_authenticated_user
from helpers import get_db
from firecrawl_service import extract_emails_bulk

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/leads", tags=["leads"])


class EnrichEmailsRequest(BaseModel):
    lead_ids: List[str]


@router.post("/enrich-emails")
async def enrich_emails(
    request: Request,
    payload: EnrichEmailsRequest,
    auth_user: dict = Depends(get_authenticated_user)
):
    try:
        db = get_db()
        company_id = auth_user["company_id"]

        leads_response = db.client.table("leads")\
            .select("id, website")\
            .in_("id", payload.lead_ids)\
            .eq("company_id", company_id)\
            .execute()

        leads = leads_response.data or []

        # Processa todos os leads em paralelo
        email_map = await extract_emails_bulk(leads)

        updated = []
        for lead_id, email in email_map.items():
            db.client.table("leads")\
                .update({"email": email})\
                .eq("id", lead_id)\
                .execute()
            updated.append({"id": lead_id, "email": email})

        return {"updated": updated}

    except Exception as e:
        logger.error(f"Error enriching emails: {e}")
        return {"updated": [], "error": str(e)}
