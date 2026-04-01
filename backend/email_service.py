"""
Email Service - Envio de emails via SMTP
Suporta templates HTML e envio assíncrono
"""
import os
import ssl
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List
import aiosmtplib
from jinja2 import Environment
from datetime import datetime

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv('SMTP_HOST')
        self.smtp_port = int(os.getenv('SMTP_PORT', 465))
        self.smtp_user = os.getenv('SMTP_USER')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        self.from_email = os.getenv('SMTP_FROM_EMAIL')
        self.from_name = os.getenv('SMTP_FROM_NAME', 'Client4You')
        self.use_tls = os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'
        self.frontend_url = os.getenv('FRONTEND_URL', 'https://leadpro-check.preview.emergentagent.com')
        self.jinja_env = Environment(autoescape=True)
        
        if not all([self.smtp_host, self.smtp_user, self.smtp_password]):
            logger.warning("SMTP não configurado completamente. Emails não serão enviados.")
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        plain_body: Optional[str] = None
    ) -> bool:
        """
        Envia email via SMTP
        
        Args:
            to_email: Email do destinatário
            subject: Assunto do email
            html_body: Corpo do email em HTML
            plain_body: Corpo alternativo em texto simples
        
        Returns:
            True se enviado com sucesso, False caso contrário
        """
        if not all([self.smtp_host, self.smtp_user, self.smtp_password]):
            logger.error("SMTP não configurado. Email não enviado.")
            return False
        
        try:
            # Criar mensagem
            message = MIMEMultipart('alternative')
            message['From'] = f"{self.from_name} <{self.from_email}>"
            message['To'] = to_email
            message['Subject'] = subject
            
            # Adicionar corpo em texto simples (fallback)
            if plain_body:
                part1 = MIMEText(plain_body, 'plain', 'utf-8')
                message.attach(part1)
            
            # Adicionar corpo HTML
            part2 = MIMEText(html_body, 'html', 'utf-8')
            message.attach(part2)
            
            # Configurar SSL/TLS
            if self.use_tls:
                context = ssl.create_default_context()
                smtp = aiosmtplib.SMTP(
                    hostname=self.smtp_host,
                    port=self.smtp_port,
                    use_tls=True,
                    tls_context=context
                )
            else:
                smtp = aiosmtplib.SMTP(
                    hostname=self.smtp_host,
                    port=self.smtp_port
                )
            
            # Conectar e enviar
            await smtp.connect()
            await smtp.login(self.smtp_user, self.smtp_password)
            await smtp.send_message(message)
            await smtp.quit()
            
            logger.info(f"✅ Email enviado com sucesso para {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Erro ao enviar email para {to_email}: {e}")
            return False
    
    async def send_purchase_confirmation(
        self,
        user_email: str,
        user_name: str,
        plan_name: str,
        plan_features: List[str],
        order_id: str
    ) -> bool:
        """
        Envia email de confirmação de compra
        """
        subject = f"🎉 Bem-vindo ao {plan_name}!"
        
        html_template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    line-height: 1.6; 
                    color: #333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                }
                .container { 
                    max-width: 600px; 
                    margin: 20px auto; 
                    background: #ffffff;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #FF8C00 0%, #FFC300 100%);
                    color: white; 
                    padding: 30px 20px; 
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 28px;
                }
                .content { 
                    padding: 30px 20px;
                }
                .plan-box {
                    background: #f8f9fa;
                    border-left: 4px solid #FF8C00;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 5px;
                }
                .plan-box h2 {
                    margin-top: 0;
                    color: #FF8C00;
                }
                .features {
                    list-style: none;
                    padding: 0;
                }
                .features li {
                    padding: 8px 0;
                    padding-left: 25px;
                    position: relative;
                }
                .features li:before {
                    content: "✓";
                    position: absolute;
                    left: 0;
                    color: #28a745;
                    font-weight: bold;
                }
                .button {
                    display: inline-block;
                    padding: 12px 30px;
                    background: linear-gradient(135deg, #FF8C00 0%, #FFC300 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                    font-weight: bold;
                }
                .footer {
                    background: #f8f9fa;
                    padding: 20px;
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                }
                .order-id {
                    background: #e9ecef;
                    padding: 10px;
                    border-radius: 5px;
                    font-family: monospace;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Compra Confirmada!</h1>
                </div>
                
                <div class="content">
                    <p>Olá <strong>{{ user_name }}</strong>,</p>
                    
                    <p>Sua compra foi aprovada com sucesso! Agora você tem acesso completo ao <strong>{{ plan_name }}</strong>.</p>
                    
                    <div class="plan-box">
                        <h2>{{ plan_name }}</h2>
                        <p><strong>O que você pode fazer agora:</strong></p>
                        <ul class="features">
                        {% for feature in plan_features %}
                            <li>{{ feature }}</li>
                        {% endfor %}
                        </ul>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="{{ frontend_url }}/login" class="button">
                            Acessar Plataforma
                        </a>
                    </div>
                    
                    <p><strong>Número do Pedido:</strong></p>
                    <div class="order-id">{{ order_id }}</div>
                    
                    <p style="margin-top: 30px;">Se tiver qualquer dúvida, estamos aqui para ajudar!</p>
                    
                    <p>Atenciosamente,<br>
                    <strong>Equipe Client4You</strong></p>
                </div>
                
                <div class="footer">
                    <p>Este é um email automático, por favor não responda.</p>
                    <p>© {{ current_year }} Client4You - Todos os direitos reservados</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        template = self.jinja_env.from_string(html_template)
        html_body = template.render(
            user_name=user_name,
            plan_name=plan_name,
            plan_features=plan_features,
            order_id=order_id,
            frontend_url=self.frontend_url,
            current_year=datetime.now().year
        )
        
        plain_body = f"""
        Olá {user_name},
        
        Sua compra foi aprovada com sucesso!
        
        Plano: {plan_name}
        Pedido: {order_id}
        
        Acesse: {self.frontend_url}/login
        
        Atenciosamente,
        Equipe Client4You
        """
        
        return await self.send_email(user_email, subject, html_body, plain_body)
    
    async def send_campaign_completed(
        self,
        user_email: str,
        user_name: str,
        campaign_name: str,
        total_sent: int,
        total_errors: int,
        total_contacts: int,
        campaign_id: str
    ) -> bool:
        """
        Envia email quando campanha de WhatsApp termina
        """
        success_rate = (total_sent / total_contacts * 100) if total_contacts > 0 else 0
        
        subject = f"✅ Campanha '{campaign_name}' Concluída"
        
        html_template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    line-height: 1.6; 
                    color: #333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                }
                .container { 
                    max-width: 600px; 
                    margin: 20px auto; 
                    background: #ffffff;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                    color: white; 
                    padding: 30px 20px; 
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 28px;
                }
                .content { 
                    padding: 30px 20px;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    margin: 25px 0;
                }
                .stat-box {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    text-align: center;
                    border: 2px solid #e9ecef;
                }
                .stat-number {
                    font-size: 32px;
                    font-weight: bold;
                    color: #FF8C00;
                    margin: 10px 0;
                }
                .stat-label {
                    color: #666;
                    font-size: 14px;
                }
                .success-rate {
                    background: #d4edda;
                    border: 2px solid #28a745;
                    color: #155724;
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                    font-size: 18px;
                    font-weight: bold;
                    margin: 20px 0;
                }
                .button {
                    display: inline-block;
                    padding: 12px 30px;
                    background: linear-gradient(135deg, #FF8C00 0%, #FFC300 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                    font-weight: bold;
                }
                .footer {
                    background: #f8f9fa;
                    padding: 20px;
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                }
                .campaign-name {
                    background: #e9ecef;
                    padding: 15px;
                    border-radius: 5px;
                    font-size: 18px;
                    font-weight: bold;
                    color: #495057;
                    margin: 15px 0;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Campanha Concluída!</h1>
                </div>
                
                <div class="content">
                    <p>Olá <strong>{{ user_name }}</strong>,</p>
                    
                    <p>Sua campanha de WhatsApp foi concluída com sucesso!</p>
                    
                    <div class="campaign-name">
                        {{ campaign_name }}
                    </div>
                    
                    <div class="success-rate">
                        Taxa de Sucesso: {{ success_rate }}%
                    </div>
                    
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-label">Total de Contatos</div>
                            <div class="stat-number">{{ total_contacts }}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">Enviados com Sucesso</div>
                            <div class="stat-number" style="color: #28a745;">{{ total_sent }}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">Com Erro</div>
                            <div class="stat-number" style="color: #dc3545;">{{ total_errors }}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">Pendentes</div>
                            <div class="stat-number" style="color: #ffc107;">{{ total_pending }}</div>
                        </div>
                    </div>
                    
                    <p>Você pode visualizar os detalhes completos e logs da campanha na plataforma.</p>
                    
                    <div style="text-align: center;">
                        <a href="{{ frontend_url }}/disparador" class="button">
                            Ver Detalhes da Campanha
                        </a>
                    </div>
                    
                    <p style="margin-top: 30px;">Continue aproveitando todas as funcionalidades da plataforma!</p>
                    
                    <p>Atenciosamente,<br>
                    <strong>Equipe Client4You</strong></p>
                </div>
                
                <div class="footer">
                    <p>Este é um email automático, por favor não responda.</p>
                    <p>© {{ current_year }} Client4You - Todos os direitos reservados</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        template = self.jinja_env.from_string(html_template)
        html_body = template.render(
            user_name=user_name,
            campaign_name=campaign_name,
            total_contacts=total_contacts,
            total_sent=total_sent,
            total_errors=total_errors,
            total_pending=total_contacts - total_sent - total_errors,
            success_rate=f"{success_rate:.1f}",
            campaign_id=campaign_id,
            frontend_url=self.frontend_url,
            current_year=datetime.now().year
        )
        
        plain_body = f"""
        Olá {user_name},
        
        Sua campanha '{campaign_name}' foi concluída!
        
        Resultados:
        - Total de contatos: {total_contacts}
        - Enviados: {total_sent}
        - Erros: {total_errors}
        - Taxa de sucesso: {success_rate:.1f}%
        
        Acesse: {self.frontend_url}/disparador
        
        Atenciosamente,
        Equipe Client4You
        """
        
        return await self.send_email(user_email, subject, html_body, plain_body)


# Instância global
_email_service: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Retorna instância do serviço de email"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
