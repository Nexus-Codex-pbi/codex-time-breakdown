# Test Plan – Codex Time Breakdown

## 1. Functional Tests
- [ ] Visual loads without errors
- [ ] Visual renders with sample data
- [ ] Visual handles empty data gracefully
- [ ] All format pane options apply correctly
- [ ] Selection / cross-filter works (if applicable)
- [ ] Tooltips appear on hover

## 2. Performance Tests
- [ ] update() completes < 250ms
- [ ] No memory leaks
- [ ] Bundle size < 2.5 MB

## 3. Accessibility Tests
- [ ] Keyboard navigation works
- [ ] High contrast mode supported
- [ ] ARIA labels present
- [ ] No flashing content

## 4. Security Tests
- [ ] No external network calls
- [ ] No telemetry
- [ ] No external scripts or fonts
- [ ] No DOM escape or eval

## 5. Packaging Tests
- [ ] pbiviz builds successfully
- [ ] Bundle size < 2.5 MB
- [ ] capabilities.json valid

## 6. Sample PBIX Verification
- [ ] Demonstrates all features
- [ ] Demonstrates formatting options
- [ ] Demonstrates interactions

## 7. Background Transparency (TRANS-01/02/03/05)
- [ ] Background card (Colour + Transparency) appears in the format pane
- [ ] Transparency 0% renders fully opaque background over a non-white report canvas
- [ ] Transparency 50% shows true partial transparency (canvas colour blends through) over a non-white canvas
- [ ] Transparency 100% shows fully transparent background (canvas colour shows through completely)
- [ ] Old saved report (no background properties set) renders pixel-identical to pre-upgrade — no background painted on the SVG (transparency defaults to 100 on this visual specifically since neither the scroll container, SVG, nor content group was ever painted before this plan, D-06)
- [ ] Light theme and dark theme both render correctly with transparency applied
- [ ] High contrast mode shows no background paint (matches pre-plan behaviour)

## 8. Conditional Formatting / fx (TRANS-04)
- [ ] fx button appears next to Total Colour swatch in the format pane
- [ ] Binding a measure to a conditional formatting rule on Total Colour changes colour per category row
- [ ] Rows without a rule fall back to the static Total Colour swatch value

## 9. Context Menu Regression (CERT-01 — pbiTimeBreakdown is the passing-cert reference)
- [ ] Right-click anywhere within the visual still opens the Power BI context menu after the background transparency change (existing contextmenu listener on `this.target`, unchanged by this plan)

## 10. Visual Title (TITLE-01)
- [ ] Title card appears in the format pane ("Visual Title") with Show Title (off by default), Title Text, Font, Alignment, Font Color
- [ ] Show Title off (default) renders no title text and reserves no extra vertical space — old saved report (no title properties set) is pixel-identical to pre-upgrade (D-06)
- [ ] Show Title on + Title Text set renders the title as a persistent SVG text element above the rows, reserving vertical space (rows shift down)
- [ ] Title Font (family/size/bold/italic/underline) and Alignment (left/center/right, mapped to text-anchor) apply correctly
- [ ] Title Font Color applies; high contrast mode overrides to the theme foreground colour

## 11. Per-Surface Text Treatment (TEXT-01)
- [ ] Category label: Font Family/Bold/Italic/Underline apply; Bold off (default) renders the pre-existing font-weight 600, not 400; Bold on renders 700
- [ ] Segment label/value text (both the in-bar and above-bar "too narrow" placements): Font Family/Bold/Italic/Underline apply; Bold off (default) renders the pre-existing font-weight 500
- [ ] Total/summary label: new dedicated Font (Family/Size/Bold/Italic/Underline) card; Bold defaults ON, reproducing the pre-existing hardcoded font-weight 700 at default; Font Size decoupled from Category Font Size (documented behaviour change — was previously tied to categoryFontSize)
- [ ] Axis titles and legend swatches are unchanged (out of this plan's per-surface scope) — still render on the static Category Label Colour swatch

## 12. Text-Colour fx (TEXT-02)
- [ ] fx button appears next to Category Label Colour swatch in the format pane
- [ ] Binding a measure to a conditional formatting rule on Category Label Colour changes the category label colour per row
- [ ] Rows without a rule fall back to the static Category Label Colour swatch value
- [ ] Total Colour fx (pre-existing from TRANS-04) continues to work unchanged

## 13. Render-Nothing Defaults (D-06)

## 14. v2 Board Look — Categorical Ramp + LED Gaps (LOOK-03)
- [ ] Segment 1/2/3 default colours ship the v3 categorical ramp (cyan / violet / magenta, spectrumRamp(index, 3) dark theme) on a brand-new report
- [ ] A report with a custom Segment 1/2/3 colour already set keeps that exact colour (D-16)
- [ ] Adjacent segments in the same row render with a visible 1px LED gap; the true outer ends of the run (first segment's left corners, last segment's right corners) carry the fuller user-set Bar Radius, while every inner-adjacent edge uses a smaller LED radius
- [ ] A single-segment row (only one of Segment 1/2/3 bound with a positive value) renders fully rounded on all four corners

## 15. v2 Board Look — Dead Time Segment (LOOK-03)
- [ ] Dead Time Segment defaults to "None" — a report that never touches this property renders identically to pre-plan behaviour (every segment on the categorical ramp/custom colour)
- [ ] Selecting Segment 1/2/3 as the Dead Time Segment renders that segment (bar + legend swatch) in the shared muted/unit-token grey, overriding its own Segment Colour swatch
- [ ] High contrast: the dead-time segment still renders the system foreground colour like every other segment (HC takes precedence over the grey override)

## 16. v2 Board Look — Degradation Ladder (LOOK-03)
- [ ] At normal tile widths, in-segment callouts (segment label/value text), the legend, axis titles, and the visual title all render per their own toggles
- [ ] Shrinking the tile hides in-segment callouts FIRST (segW-based per-segment suppression already existed; a global width threshold now also suppresses them suite-wide)
- [ ] Shrinking further hides the legend and axis titles NEXT, even if their own toggles are still ON
- [ ] Shrinking further still hides the visual title LAST
- [ ] Widening the tile back out restores each surface in reverse order — nothing is permanently disabled by a narrow resize

## 17. v2 Board Look — Motion + Corner Signature (LOOK-03)
- [ ] The Total label settles via the shared settle() helper (capped at MOTION_MAX_MS, skipped under prefers-reduced-motion) only when its displayed text actually changes for that category — not on every re-render
- [ ] An accent-cyan corner-bracket signature appears at the card's top-left/bottom-right corners, muted (dimmed, no glow) on the empty-data state
- [ ] Corner bracket colour swaps to the system foreground colour under high contrast, with glow disabled

## 18. D-16 Override Resolution (LOOK-03)
- [ ] Segment/Total Colour, Bar Radius, and all pre-existing toggles keep resolving exactly as before when explicitly set on a saved report
- [ ] The new Dead Time Segment property is purely additive — its absence (the common case) changes nothing about existing rendering
- [ ] Old saved report with none of the new title/font/alignment properties set renders pixel-identical to pre-upgrade: no title, category label at weight 600, segment text at weight 500, total label at weight 700 sized to 12px, all at prior default colours