"""Testes do módulo de validação/scoring/extração de emails.

Inclui casos do contexto brasileiro: TLD `.com.br`, ofuscação em português
(`arroba`/`ponto`), e match fuzzy de domínio com hífen vs sem hífen.
"""
from services.email_providers.validators import (
    BLACKLIST_DOMAINS,
    BLACKLIST_LOCAL_PARTS,
    CORPORATE_LOCAL_PARTS,
    extract_cnpjs,
    extract_emails,
    get_domain,
    is_valid_email,
    pick_best_email,
    score_email,
)


# ─── get_domain ────────────────────────────────────────────────────────────

class TestGetDomain:
    def test_with_protocol(self):
        assert get_domain("https://www.empresa.com.br") == "empresa.com.br"

    def test_without_protocol(self):
        assert get_domain("empresa.com.br") == "empresa.com.br"

    def test_strips_www(self):
        assert get_domain("http://www.empresa.com.br/path") == "empresa.com.br"

    def test_strips_path_and_query(self):
        assert get_domain("https://empresa.com/contato?utm=1") == "empresa.com"

    def test_strips_port(self):
        assert get_domain("http://empresa.com:8080/") == "empresa.com"

    def test_lowercases(self):
        assert get_domain("HTTPS://Empresa.COM.BR") == "empresa.com.br"

    def test_none(self):
        assert get_domain(None) is None

    def test_empty(self):
        assert get_domain("") is None
        assert get_domain("   ") is None


# ─── extract_emails ─────────────────────────────────────────────────────────

class TestExtractEmails:
    def test_plain(self):
        assert extract_emails("Fale com contato@empresa.com.br") == ["contato@empresa.com.br"]

    def test_multiple(self):
        text = "Email: vendas@empresa.com.br ou contato@empresa.com.br"
        result = extract_emails(text)
        assert set(result) == {"vendas@empresa.com.br", "contato@empresa.com.br"}

    def test_dedup_case_insensitive(self):
        text = "contato@x.com contato@x.com CONTATO@X.COM"
        assert extract_emails(text) == ["contato@x.com"]

    def test_obfuscated_at_brackets_pt(self):
        text = "Email: contato [arroba] empresa.com.br"
        assert "contato@empresa.com.br" in extract_emails(text)

    def test_obfuscated_at_brackets_en(self):
        text = "Email: contato [at] empresa.com.br"
        assert "contato@empresa.com.br" in extract_emails(text)

    def test_obfuscated_dot_brackets_pt(self):
        text = "Email: contato@empresa [ponto] com [ponto] br"
        assert "contato@empresa.com.br" in extract_emails(text)

    def test_obfuscated_arroba_spaced_pt(self):
        text = "Contato arroba empresa.com.br"
        assert "contato@empresa.com.br" in extract_emails(text)

    def test_obfuscated_parens(self):
        text = "vendas(arroba)empresa(ponto)com(ponto)br"
        assert "vendas@empresa.com.br" in extract_emails(text)

    def test_english_spaced_at_NOT_deobfuscated(self):
        # Decisão de design: ` at ` em inglês é ambíguo demais.
        # "meet you at empresa.com" não pode virar "you@empresa.com".
        text = "We'll meet you at empresa.com to discuss"
        assert extract_emails(text) == []

    def test_empty(self):
        assert extract_emails("") == []
        assert extract_emails(None) == []

    def test_no_email(self):
        assert extract_emails("Nenhum endereço aqui, só texto.") == []


# ─── extract_cnpjs ──────────────────────────────────────────────────────────

class TestExtractCnpjs:
    def test_masked(self):
        assert extract_cnpjs("CNPJ: 12.345.678/0001-90") == ["12345678000190"]

    def test_unmasked(self):
        assert extract_cnpjs("CNPJ 12345678000190 inscrito") == ["12345678000190"]

    def test_multiple_dedup(self):
        text = "CNPJ 12.345.678/0001-90 — 12345678000190"
        assert extract_cnpjs(text) == ["12345678000190"]

    def test_invalid_length_ignored(self):
        assert extract_cnpjs("123456") == []

    def test_empty(self):
        assert extract_cnpjs("") == []
        assert extract_cnpjs(None) == []


# ─── score_email — blacklists ───────────────────────────────────────────────

class TestScoreBlacklist:
    def test_noreply_zeroed(self):
        assert score_email("noreply@empresa.com.br", "empresa.com.br") == 0.0

    def test_wordpress_local_zeroed(self):
        assert score_email("wordpress@empresa.com.br", "empresa.com.br") == 0.0

    def test_hostgator_domain_zeroed(self):
        assert score_email("user@hostgator.com.br", "empresa.com.br") == 0.0

    def test_subdomain_of_blacklist_zeroed(self):
        # mail.wordpress.com cai porque wordpress.com está na blacklist
        assert score_email("contato@mail.wordpress.com", None) == 0.0

    def test_wixsite_zeroed(self):
        assert score_email("user@empresa.wixsite.com", "empresa.com") == 0.0

    def test_disjoint_corporate_vs_blacklist(self):
        # Sanity: nenhum termo corporate deveria estar na blacklist
        assert CORPORATE_LOCAL_PARTS.isdisjoint(BLACKLIST_LOCAL_PARTS)


# ─── score_email — match de domínio ─────────────────────────────────────────

class TestScoreDomainMatch:
    def test_exact_match_br_full_signal(self):
        # 0.5 (base) + 0.5 (match) + 0.2 (.br) + 0.1 (contato) = 1.3 → clamp 1.0
        assert score_email("contato@empresa.com.br", "empresa.com.br") == 1.0

    def test_exact_match_com(self):
        # 0.5 + 0.5 + 0 + 0.1 = 1.0 (no clamp needed)
        assert score_email("contact@empresa.com", "empresa.com") == 1.0

    def test_subdomain_match_counts_as_exact(self):
        s = score_email("contato@mail.empresa.com.br", "empresa.com.br")
        assert s > 0.8

    def test_same_root_diff_tld(self):
        # site .com, email .com.br — mesma raiz "empresa"
        s = score_email("info@empresa.com.br", "empresa.com")
        # 0.5 + 0.4 + 0.2 + 0.1 (info corp) = 1.2 → clamp 1.0
        assert s >= 0.9

    def test_fuzzy_match_hyphen_borderline(self):
        # Caso real BR: site indexado como "restaurantex.com.br" mas email usa
        # "restaurante-x.com.br" (ou vice-versa). Deve ser médio-alto.
        s = score_email("contato@restaurante-x.com.br", "restaurantex.com.br")
        assert s >= 0.8

    def test_no_site_neutral_passes(self):
        # Sem site, email .br ainda passa por baseline + .br
        s = score_email("info@empresa.com.br", None)
        assert s > 0.3
        assert s < 0.9

    def test_unrelated_domain_passes_threshold_but_low(self):
        # gmail quando site é empresa.com.br — sem match, sem .br
        s = score_email("contato@gmail.com", "empresa.com.br")
        # 0.5 + 0 + 0 + 0.1 = 0.6 — passa o threshold mas baixo
        assert 0.4 < s < 0.7


# ─── score_email — heurísticas de local part ────────────────────────────────

class TestScoreLocalPart:
    def test_corporate_beats_random(self):
        # Sem domain match (lead_domain=None) pra evitar clamp em 1.0
        s_corp = score_email("contato@empresa.com", None)
        s_rand = score_email("xyz123@empresa.com", None)
        assert s_corp > s_rand

    def test_personal_penalty(self):
        personal = score_email("joao.silva@empresa.com.br", "empresa.com.br")
        corp = score_email("contato@empresa.com.br", "empresa.com.br")
        assert personal < corp

    def test_empty_inputs(self):
        assert score_email("", "x.com") == 0.0
        assert score_email("malformed", "x.com") == 0.0
        assert score_email("@nolocal.com", "x.com") == 0.0
        assert score_email("noatdomain", "x.com") == 0.0


# ─── is_valid_email ─────────────────────────────────────────────────────────

class TestIsValid:
    def test_valid_corporate_brasileiro(self):
        lead = {"website": "https://empresa.com.br"}
        assert is_valid_email("contato@empresa.com.br", lead) is True

    def test_invalid_noreply(self):
        lead = {"website": "https://empresa.com.br"}
        assert is_valid_email("noreply@empresa.com.br", lead) is False

    def test_invalid_hostgator(self):
        lead = {"website": "https://restaurante.com.br"}
        assert is_valid_email("webmaster@hostgator.com.br", lead) is False

    def test_uses_domain_field_when_no_website(self):
        # DataForSEO devolve `domain`, não `website` em alguns casos
        lead = {"domain": "empresa.com.br"}
        assert is_valid_email("contato@empresa.com.br", lead) is True

    def test_personal_email_no_site_borderline_invalid(self):
        # joao.silva sem site: 0.5 - 0.3 = 0.2 → invalid
        lead = {"website": None}
        assert is_valid_email("joao.silva@gmail.com", lead) is False


# ─── pick_best_email ────────────────────────────────────────────────────────

class TestPickBest:
    def test_prefers_domain_match(self):
        lead = {"website": "empresa.com.br"}
        candidates = ["random@gmail.com", "contato@empresa.com.br"]
        result = pick_best_email(candidates, lead)
        assert result is not None
        assert result[0] == "contato@empresa.com.br"

    def test_prefers_corporate_over_personal(self):
        lead = {"website": "empresa.com.br"}
        candidates = ["joao.silva@empresa.com.br", "contato@empresa.com.br"]
        result = pick_best_email(candidates, lead)
        assert result is not None
        assert result[0] == "contato@empresa.com.br"

    def test_skips_blacklisted(self):
        lead = {"website": "empresa.com.br"}
        candidates = ["noreply@empresa.com.br", "wordpress@hostgator.com.br"]
        assert pick_best_email(candidates, lead) is None

    def test_returns_score(self):
        lead = {"website": "empresa.com.br"}
        result = pick_best_email(["contato@empresa.com.br"], lead)
        assert result is not None
        _, score = result
        assert 0.3 < score <= 1.0

    def test_empty(self):
        lead = {"website": "x.com"}
        assert pick_best_email([], lead) is None


# ─── Integração: extract + pick (caso real BR) ──────────────────────────────

class TestEndToEndBrasileiro:
    def test_html_com_ofuscacao_e_pessoal_e_lixo(self):
        html = """
            <p>Fale conosco: contato [arroba] restaurante-bom [ponto] com [ponto] br</p>
            <p>RH: joao.silva@restaurante-bom.com.br</p>
            <p>Suporte hospedagem: wordpress@hostgator.com.br</p>
        """
        emails = extract_emails(html)
        # Extração captura tudo — filtrar é função do scorer
        assert "contato@restaurante-bom.com.br" in emails
        assert "joao.silva@restaurante-bom.com.br" in emails
        assert "wordpress@hostgator.com.br" in emails

        lead = {"website": "https://www.restaurante-bom.com.br"}
        best = pick_best_email(emails, lead)
        assert best is not None
        assert best[0] == "contato@restaurante-bom.com.br"

    def test_fuzzy_hifen_match_real(self):
        # Site indexado sem hífen, email com hífen — variação ortográfica comum
        lead = {"website": "https://restaurantex.com.br"}
        candidates = ["contato@restaurante-x.com.br"]
        result = pick_best_email(candidates, lead)
        assert result is not None
        _, score = result
        assert score >= 0.8  # médio-alto via fuzzy + .br + corporate

    def test_dataforseo_only_domain_field(self):
        # Simula caso onde só temos `domain` (vindo do DataForSEO contact_url) e
        # nenhum `website` — o validator deve resolver
        lead = {"domain": "empresa.com.br", "website": None}
        result = pick_best_email(["contato@empresa.com.br", "random@gmail.com"], lead)
        assert result is not None
        assert result[0] == "contato@empresa.com.br"
