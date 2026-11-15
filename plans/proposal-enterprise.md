# PRD: Klepai Enterprise (wersja szybka, szkic)

> Szkic bez pełnego wywiadu. Założenia oznaczone jako **[ZAŁOŻENIE]** wymagają potwierdzenia.

## Overview
Klepai Enterprise to self-hosted wersja Klepai, uruchamiana na serwerze firmy, z kontami, rolami, kontrolą modeli i logami audytowymi. Pozwala firmom korzystać z lokalnych LLM bez wysyłania danych do zewnętrznych dostawców.

## Stan obecnego produktu
Klepai działa już na wszystkich systemach desktopowych (macOS, Windows, Linux). Jest to aplikacja desktopowa dla jednego użytkownika, bez kont, ról, współbieżnego dostępu i trybu serwerowego. Te elementy są przedmiotem tego PRD.

## Problem Statement
Firmy z wrażliwymi danymi (finanse, zdrowie, prawo, sektor publiczny) nie mogą używać chmurowych modeli, a obecny Klepai to aplikacja desktopowa dla jednego użytkownika. Brak kont, ról, audytu i wspólnego serwera uniemożliwia wdrożenie w firmie.

## Users
| User type | Description | Volume |
|-----------|-------------|--------|
| Admin IT / bezpieczeństwa | Instaluje, konfiguruje modele, limity, SSO, logi | 1–2 na firmę |
| Pracownik | Używa czatu i agentów w ramach dozwolonych modeli | 10–200 na firmę |
| Audytor / compliance | Przegląda logi i raporty zużycia | 1–3 na firmę |

## Goals & Success Criteria
- [ ] Pierwsza firma pilotażowa uruchamia Klepai Enterprise na własnym serwerze w ciągu 1 dnia
- [ ] Admin może nadać i odebrać dostęp przez SSO w mniej niż 5 minut
- [ ] Każde zapytanie do modelu jest zapisane w logu audytowym z użytkownikiem i czasem
- [ ] 2 płacące firmy w ciągu 6 miesięcy od pierwszej wersji **[ZAŁOŻENIE]**

## User Stories
1. As an admin, I want to log in via SSO and assign roles so that only authorized people use the company's models.
2. As an admin, I want to approve a list of models and set token budgets per team so that costs and risk stay under control.
3. As an auditor, I want to export usage logs so that I can prove compliance with internal policies.
4. As an employee, I want to chat with approved models through a browser or desktop app so that I can work without sending data outside the company.
5. As an admin, I want to block sensitive data patterns (e.g. card numbers, PESEL) before they reach a model so that personal data is not leaked.

## Scope
### In scope
- Tryb serwerowy (jedna instancja na serwerze firmy, klienci przez przeglądarkę i desktop)
- Konta, role (admin, użytkownik, audytor), SSO (SAML/OIDC)
- Katalog zatwierdzonych modeli i limity tokenów per zespół/użytkownik
- Logi audytowe z eksportem i retencją
- Filtrowanie danych wrażliwych przed wysłaniem do modelu
- Instalacja offline (paczka air-gapped)
- Wersja Ollama i endpointy zgodne z OpenAI

### Out of scope (v1)
- Hosting w chmurze po stronie CrystalPlatforms
- RAG nad dokumentami firmy (następna faza)
- Agenci kodu z bramkami zatwierdzania (następna faza)
- Rozliczenia i fakturowanie w aplikacji

## System Components
- **Serwer Klepai** (Rust core): kolejka zapytań, routing do modeli, logi, limity
- **Warstwa tożsamości**: integracja z SSO firmy, mapowanie grup na role
- **Panel admina**: modele, limity, użytkownicy, logi
- **Interfejs czatu**: przeglądarka (React) oraz istniejący klient desktop (Tauri), dostępny na wszystkich systemach desktop
- **Połączenie z modelami**: Ollama lub dowolny endpoint OpenAI-compatible w sieci firmy

## Implementation Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architektura | Jedna instancja serwerowa, wielu klientów | Firma nie chce instalować na każdym laptopie |
| Baza danych | Do ustalenia (SQLite wystarcza na pilot, PostgreSQL dla wielu użytkowników) | Obecny SQLite jest single-user |
| Dystrybucja | Docker lub paczka offline | Łatwe wdrożenie w firmie i tryb air-gapped |
| Tożsamość | SAML/OIDC | Standard w firmach, zgodny z Entra ID i Google Workspace |
| Monetyzacja | Licencja roczna per instancja lub per użytkownik **[ZAŁOŻENIE]** | Model znany z Open WebUI i LiteLLM |

## Validation Strategy
- Rozmowy z 3–5 osobami odpowiedzialnymi za IT/bezpieczeństwo w docelowych firmach przed budową
- Prototyp serwera z kontami i logami, testowany w jednej firmie pilotażowej
- Mierzenie, czy firma używa funkcji z listy po 30 dniach

## Open Questions
- [ ] Czy firmy wolą licencję per instancja czy per użytkownik?
- [ ] Które kategorie firm są pierwsze (finanse, zdrowie, prawo, sektor publiczny)?
- [ ] Czy wymagany jest audyt zewnętrzny lub certyfikacja (np. ISO 27001) już w v1?
- [ ] Jaka baza danych w wersji serwerowej?
- [ ] Kto wspiera wdrożenia u klienta: sam autor czy partner?
- [ ] Jak wygląda aktualizacja w trybie air-gapped?

## References
- Discovery summary: inline (rozmowa o enterprise Klepai)
- Stan obecnego produktu: /areas/klepai.md
