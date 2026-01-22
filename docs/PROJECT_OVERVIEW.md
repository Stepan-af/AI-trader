# PROJECT_OVERVIEW.md

## Project Name
Web Trading Platform (MVP)

## One-Line Summary
Web-платформа для автоматизированной и полуавтоматизированной торговли и бэктестинга стратегий на одной бирже с фокусом на **корректное исполнение, контроль рисков и воспроизводимость результатов**.

---

## Problem Statement
Большинство трейдинговых платформ:
- либо слишком простые (ручная торговля, без автоматизации),
- либо слишком сложные и рискованные (обещают HFT, ML, «автодоход» без инженерной надёжности),
- либо не дают прозрачности исполнения и расчёта PnL.

Пользователям нужен инструмент, который:
- **реально умеет сам торговать**,
- предсказуемо исполняет ордера,
- позволяет честно тестировать стратегии,
- не скрывает риски и ограничения.

---

## Project Goal (MVP)
Создать **надёжный web-продукт**, который позволяет:
- настраивать и запускать автоматические стратегии,
- проводить детерминированный бэктест,
- безопасно исполнять ордера на бирже,
- видеть полную картину портфеля и результатов.

Проект **не является HFT-системой** и не конкурирует с профессиональными проп-HFT платформами.

---

## Target Users
- Индивидуальные трейдеры
- Quant-энтузиасты
- Dev-ориентированные пользователи
- Малые команды, тестирующие торговые идеи

---

## Supported Platforms
- **Web (desktop)**
Мобильные приложения **не входят в MVP**.

---

## MVP Scope (Strict)

### Supported in MVP
- Web UI
- 1 биржа: **Binance Spot**
- Типы стратегий:
  - DCA
  - Grid
  - Rule-based Swing (DSL, без кода)
- Candle-based trading (1s–1h)
- Backtesting на исторических данных
- Paper trading и Live trading
- Типы ордеров:
  - Market
  - Limit
  - Stop Loss / Take Profit
- Portfolio:
  - Балансы
  - Позиции
  - Realized / Unrealized PnL
- Alerts (web / email)
- Manual emergency stop (kill switch)

---

## Explicitly Out of Scope (MVP)
- Mobile apps
- HFT / tick-level / order-book strategies
- Multi-exchange trading
- Futures / margin / options
- ML / RL / sentiment analysis
- Strategy marketplace
- Copy trading
- Social features

---

## Core Principles
- **Correctness > Speed**
- **Execution safety > strategy variety**
- **Deterministic backtests**
- **Explicit system limits**
- **No hidden automation**

---

## Success Metrics (MVP)
- Identical backtest input → identical output
- No duplicated or “lost” orders
- Order lifecycle consistency across restarts
- p95 internal processing latency < **150 ms**
- Stable operation with:
  - 100 active users
  - ~1,000 orders/day

---

## Technical Overview (High Level)
- Frontend: React + TypeScript
- Backend: Node.js (NestJS / Fastify)
- Database: PostgreSQL + TimescaleDB
- Jobs / cache: Redis
- Deployment: Docker (Kubernetes-ready)

---

## Non-Goals
- Не гарантируется прибыль
- Не гарантируется latency биржи
- Не предоставляются инвестиционные рекомендации

---

## Project Phases
1. **MVP** — single exchange, limited strategies, safe execution
2. Advanced execution (partial fills, OCO)
3. Multi-exchange support
4. Strategy expansion
5. ML / optimization / marketplace (optional)

---

## Key Risks
- Exchange API instability
- Incorrect order reconciliation
- User strategy misconfiguration
- Operational errors during live trading

---

## Definition of Done (MVP)
- Пользователь может:
  - создать стратегию,
  - провести бэктест,
  - запустить paper trading,
  - включить live trading,
  - остановить торговлю в любой момент.
- Система корректно восстанавливается после рестарта.
- Все ордера имеют полный жизненный цикл и аудит.

---
