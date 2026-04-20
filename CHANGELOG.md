# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once it reaches `1.0.0`.

## [Unreleased]

### Added

- GitHub Actions CI workflow covering:
  - `senses-ref` tests
  - `senses-ref` validation of `examples/senses`
  - Typecheck for `openclaw-senses-plugin`
- `SECURITY.md` with private vulnerability reporting guidance.
- `RELEASE_READINESS.md` with explicit release gates and local verification commands.

## [0.1.0] - 2026-04-20

### Added

- Initial public project structure:
  - `specification/` for the Sense format and integration notes
  - `senses-ref/` reference validator and CLI
  - `openclaw-senses-plugin/` plugin implementation
  - `examples/senses/` demo and product-shaped sense packs
  - `skills/` staged test and explainer skills
