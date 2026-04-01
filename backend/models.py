from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


# ========== WAHA Config Models ==========
class WahaConfigCreate(BaseModel):
    waha_url: str
    api_key: str
    session_name: str = "default"


class WahaConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    waha_url: str
    api_key: str
    session_name: str = "default"
    is_connected: bool = False
    last_check: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ========== Campaign Models ==========
class CampaignStatus(str, Enum):
    DRAFT = "draft"
    READY = "ready"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    DOCUMENT = "document"


class CampaignSettings(BaseModel):
    interval_min: int = 30  # seconds
    interval_max: int = 60  # seconds
    start_time: Optional[str] = None  # HH:MM format
    end_time: Optional[str] = None  # HH:MM format
    daily_limit: Optional[int] = None
    working_days: List[int] = [0, 1, 2, 3, 4]  # Monday to Friday
    timezone: Optional[str] = "America/Sao_Paulo"  # Fuso horário da campanha


class CampaignMessage(BaseModel):
    # Alterado para str para evitar erros de validação estrita (422)
    type: str = "text" 
    text: str
    media_url: Optional[str] = None
    media_base64: Optional[str] = None
    media_filename: Optional[str] = None


class CampaignCreate(BaseModel):
    name: str
    message: CampaignMessage
    settings: CampaignSettings = Field(default_factory=CampaignSettings)


class Campaign(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    status: CampaignStatus = CampaignStatus.DRAFT
    message: CampaignMessage
    settings: CampaignSettings
    total_contacts: int = 0
    sent_count: int = 0
    error_count: int = 0
    pending_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    message: Optional[CampaignMessage] = None
    settings: Optional[CampaignSettings] = None


# ========== Contact Models ==========
class ContactStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    ERROR = "error"
    SKIPPED = "skipped"


class Contact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    campaign_id: str
    name: str
    phone: str
    email: Optional[str] = None
    category: Optional[str] = None
    extra_data: Dict[str, Any] = Field(default_factory=dict)
    status: ContactStatus = ContactStatus.PENDING
    error_message: Optional[str] = None
    sent_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ========== Message Log Models ==========
class MessageLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    campaign_id: str
    contact_id: str
    contact_name: str
    contact_phone: str
    status: ContactStatus
    error_message: Optional[str] = None
    message_sent: Optional[str] = None
    sent_at: datetime = Field(default_factory=datetime.utcnow)


# ========== Response Models ==========
class CampaignStats(BaseModel):
    total: int
    sent: int
    pending: int
    errors: int
    progress_percent: float


class CampaignWithStats(Campaign):
    stats: CampaignStats

# ========== Agent Models ==========
class AgentWorkingHours(BaseModel):
    enabled: bool = False
    start: str = "09:00"
    end: str = "18:00"
    timezone: str = "America/Sao_Paulo"

class AgentConfigBase(BaseModel):
    enabled: bool = False
    name: str = "Assistente Virtual"
    personality: Optional[str] = None
    system_prompt: Optional[str] = None
    welcome_message: Optional[str] = None
    response_delay: int = 3
    max_response_length: int = 500
    tone: str = "professional"
    auto_qualify: bool = True
    blocked_topics: List[str] = []
    working_hours: AgentWorkingHours

class AgentConfigUpdate(AgentConfigBase):
    pass # Pode adicionar campos opcionais se necessário

class AgentConfigResponse(AgentConfigBase):
    id: str
    company_id: str
    updated_at: datetime
