# Codex Time Breakdown — Cert Notes (resubmission wave, Phase 01)

**Version:** 1.1.0.8 (visual.version) · production GUID unchanged (`codexTimeBreakdown…`) · API 5.11.0 / pbiviz 7.0.2 (pinned).

One-wave AppSource resubmission carrying the transparency/formatting rework **and** the v2 appearance redesign. Partner Center re-evaluates the whole package (Pitfall 6).

## Transparency wave (Plans 05–06)
- New **Background** card: `ColorPicker` fill + 0–100 `transparency` slider via `hexToRGBString`. Additive.
- fx conditional formatting wired on eligible colour properties.

## Title + per-region text wave (Plans 12–13)
- Title + per-region text treatment reworked with adaptive text colour.

## v2 Appearance wave (Plan 17)
- Categorical `spectrumRamp` segment default colours; 1px LED gaps with an outer-end-only full-radius law (only the true outer ends of each row's run keep the fuller user-set Bar Radius; inner-adjacent edges use a smaller LED radius).
- Optional **Dead Time Segment** (muted grey); width-based degradation ladder (callouts → legend/axis → title).
- **D-16:** saved colour/fx overrides still resolve.

## High-contrast rule
Shared HC rule wired (`src/shared/highContrast.ts`).

## Pending fixes riding this wave
None outstanding (PENDING-FIXES: nothing pending).
