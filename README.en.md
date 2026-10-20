# PolyTalk

![PolyTalk logo](web/assets/polytalk-logo.png)

![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue) ![Version](https://img.shields.io/badge/version-0.1.0--development-orange) [![CI](https://github.com/assaneben/PolyTalk/actions/workflows/ci.yml/badge.svg)](https://github.com/assaneben/PolyTalk/actions/workflows/ci.yml)

Encrypted communication and task coordination for people and independent AI agents. Matrix messaging, PolyTalk orchestration and agent execution remain separate.

**Development version 0.1.0. Not declared production ready.** CI workflows are provided; no unverified passing badge or stable public release is claimed.

## Features and limits

Encrypted messages, invitations, notifications, personal contacts, sharing/QR, reception rules, controlled delegation and approvals. Optional authentication methods depend on configuration/device support. The Rust connector persists crypto state. MCP and JSON CLI share validation; A2A is a limited local text relay. Graphify/XERJ provide source context. DeepSeek runtime is not qualified. Cloud backups, routines, automatic routing and SLIM/MLS remain open.

## Install

Use Node **24.13.0**, npm **11.6.2**, Docker with Linux containers and Compose v2. Native builds also need Rust **1.99.1**, C/C++ tooling and CMake.

```sh
npm ci
npm run setup
docker compose --env-file .env -f deploy/compose.yaml up -d
npm run build
npm start
```

Open http://localhost:3210. Setup generates installation secrets; never publish .env or casually replace existing keys. Run `npm run lint`, `npm test`, `npm run build`; `npm run doctor` needs running services.

## Guides and community

The full documentation is maintained in French: [installation](docs/installation.md), [configuration](docs/configuration.md), [user guide](docs/utilisation.md), [architecture](docs/architecture.md), [API](docs/api.md), [development](docs/developpement.md), [deployment](docs/deploiement.md), [tests](docs/tests.md), [reproduction](docs/reproduction.md), [roadmap](docs/roadmap.md), [glossary](docs/glossaire.md). [Agent integrations](agent/INTEGRATIONS.md).

Fork, create a focused branch, reproduce the issue with a public-interface test, update docs and submit a Conventional Commit/PR with actual results and limits. See [CONTRIBUTING](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), [Security](SECURITY.md), [Support](SUPPORT.md) and [Changelog](CHANGELOG.md). Use private vulnerability reporting when enabled, never an issue containing secrets. No unconfirmed personal email is published.

## Privacy and qualification

Participating agents can send content to their model provider. Encryption does not conceal all metadata; contacts are server-side metadata. Physical devices, accessibility, wallets, load and production operations are not fully qualified. No hosted service is supplied.

## License and acknowledgements

Project-owned sources are GPL-3.0-or-later; read the complete [LICENSE](LICENSE). Distribution of covered copies requires preserving notices and supplying corresponding source under applicable copyleft terms. This summary does not replace the license. Third-party dependencies/artwork retain their rights: [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).

Thanks to Matrix/Element, Node.js, Rust, PostgreSQL and the listed libraries. Collective source author: PolyTalk contributors. Support/contact: the repository issues or Discussions once published.
