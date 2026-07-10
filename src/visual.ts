"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import DataView = powerbi.DataView;

import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";
import { VisualFormattingSettingsModel, TimeBreakdownSettings, AxisSettingsCard, textAlignFor } from "./settings";
import { parseDataView, TimeBreakdownData, TimeBreakdownRow } from "./dataParser";
import { toRgba } from "./shared/colorHelpers";

// v3 appearance engine (frozen, 01-15) — accent token, dim-theme
// surfaces, the corner-bracket card signature, the capped/reduced-
// motion-aware settle() helper, and the single HC fallback rule.
// Consumed read-only (D-11). Segment colours themselves resolve through
// the EXISTING segment1/2/3Color pickers (their static defaults now ship
// the v3 categorical ramp — spectrumRamp(index, 3) — see settings.ts);
// this file never forks a second categorical-ramp computation.
import { Theme, accentToken } from "./shared/bandEngine";
import { surfaceTokens, TABULAR_NUMS } from "./shared/designTokens";
import { makeCornerBrackets, CardSignatureHandle } from "./shared/cardSignature";
import { settle, MOTION_MAX_MS } from "./shared/motion";
import { applyHighContrast } from "./shared/highContrast";

import * as d3 from "d3";

/** Luminance-based theme pick (matches the pbiNowVsThen/pbiKpiCard v3
 * pilots' own convention) — only trusts bgHex as a real signal when the
 * background layer is actually visible (transparency < 100); otherwise
 * defaults dark (this visual's pre-existing default is fully
 * transparent, D-06). */
function themeFor(hex: string, visible: boolean): Theme {
    if (!visible) return "dark";
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex || "");
    if (!m) return "dark";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "light" : "dark";
}

/**
 * roundedRectPath(x, y, w, h, rTL, rTR, rBR, rBL): a rounded-rect SVG
 * path with an independent radius per corner — SVG's native `rect`
 * only supports one uniform rx/ry, but the LED-gap segment run (§5)
 * needs BIGGER radius on the outer caps of the whole run and a smaller
 * radius on every inner-adjacent edge, so each segment is drawn as its
 * own path rather than a `<rect>`.
 */
function roundedRectPath(x: number, y: number, w: number, h: number, rTL: number, rTR: number, rBR: number, rBL: number): string {
    const maxR = Math.min(w, h) / 2;
    const tl = Math.min(rTL, maxR), tr = Math.min(rTR, maxR), br = Math.min(rBR, maxR), bl = Math.min(rBL, maxR);
    return `M ${x + tl} ${y} ` +
        `H ${x + w - tr} ` +
        `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr} ` +
        `V ${y + h - br} ` +
        `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h} ` +
        `H ${x + bl} ` +
        `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl} ` +
        `V ${y + tl} ` +
        `A ${tl} ${tl} 0 0 1 ${x + tl} ${y} Z`;
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private target: HTMLElement;
    private scrollContainer: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private backgroundRect: d3.Selection<SVGRectElement, unknown, null, undefined>;
    private titleEl: d3.Selection<SVGTextElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private localizationManager: ILocalizationManager;
    private tooltipService: ITooltipService;
    private isHighContrast: boolean = false;
    private highContrastForeground: string = "";
    private highContrastBackground: string = "";

    // State for tooltips and cross-filtering
    private rowSelectionIds: ISelectionId[] = [];
    private categoricalCategories: powerbi.DataViewCategoryColumn | undefined;
    private totalColorHelper: ColorHelper | null = null;
    // Conditional formatting (fx) state — Category label colour (TEXT-02).
    private categoryColorHelper: ColorHelper | null = null;

    // v3 card signature — one accent-tinted corner-bracket pair for the
    // whole card (a multi-row list visual, like Progress Bar Card/Now vs
    // Then — the accent cyan is the card's own identity, distinct from
    // any segment's categorical colour).
    private cornerSignature: CardSignatureHandle | null = null;

    // v3 motion — only re-settles a row's total label when its displayed
    // text changes, tracked per category so a full-rebuild render()
    // doesn't replay the settle animation on every update.
    private lastTotalByCategory: Map<string, string> = new Map();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.events = options.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = options.host.tooltipService;
        this.localizationManager = this.host.createLocalizationManager();
        this.formattingSettingsService = new FormattingSettingsService();

        this.scrollContainer = d3.select(options.element)
            .append("div")
            .attr("class", "time-breakdown-scroll")
            .style("width", "100%")
            .style("height", "100%")
            .style("overflow", "auto")
            .style("position", "relative");

        this.svg = this.scrollContainer
            .append("svg")
            .attr("class", "time-breakdown");

        // Dedicated background layer (D-05) — persistent SVG rect, first
        // child so it never paints over row/legend content. Never whole-
        // root/target opacity.
        this.backgroundRect = this.svg.append("rect").attr("class", "time-breakdown-bg");

        // Iframe-internal title (Policy 1180.2.5) — persistent SVG text,
        // shown/hidden per update() via showTitle/titleText (D-14).
        this.titleEl = this.svg.append("text").attr("class", "time-breakdown-title");

        this.container = this.svg.append("g");

        // Corner-bracket card signature — accent-tinted (the card's own
        // cyan identity, not any single segment's categorical colour),
        // appended to the scroll container (an HTML overlay above the
        // SVG, pointer-events:none) so it paints above every row.
        this.cornerSignature = makeCornerBrackets(
            this.scrollContainer.node() as HTMLElement,
            accentToken("dark"),
            { variant: "cornerBracket", mirror: true }
        );

        // Context menu
        this.target.addEventListener("contextmenu", (e: MouseEvent) => {
            this.selectionManager.showContextMenu({}, { x: e.clientX, y: e.clientY });
            e.preventDefault();
        });

        // Allow deselection
        this.selectionManager.registerOnSelectCallback(() => {});
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            // High contrast detection
            const colorPalette = this.host.colorPalette as any;
            if (colorPalette.isHighContrast) {
                this.isHighContrast = true;
                this.highContrastForeground = colorPalette.foreground.value;
                this.highContrastBackground = colorPalette.background.value;
            } else {
                this.isHighContrast = false;
            }

            const dv: DataView = options.dataViews?.[0];
            if (!dv) {
                this.container.selectAll("*").remove();
                this.backgroundRect.attr("width", 0).attr("height", 0);
                this.cornerSignature?.update(accentToken("dark"), { variant: "cornerBracket", mirror: true, muted: true });
                this.events.renderingFinished(options);
                return;
            }

            this.formattingSettings = this.formattingSettingsService
                .populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);

            // ─── v3 theme pick + single HC fallback rule, computed once
            // and reused everywhere colour is resolved below (§8, D-16:
            // this visual's own Background card is the source of truth
            // for whether the card reads as a dark or light surface).
            const bgSettingsForTheme = this.formattingSettings.background;
            const bgHexForTheme = bgSettingsForTheme.backgroundColor.value?.value ?? "#ffffff";
            const bgTransparencyForTheme = bgSettingsForTheme.transparency.value ?? 100;
            const theme: Theme = themeFor(bgHexForTheme, bgTransparencyForTheme < 100);
            const hc = applyHighContrast(colorPalette, { fallbackColor: accentToken(theme) });

            this.cornerSignature?.update(hc.active ? hc.color : accentToken(theme), {
                variant: "cornerBracket",
                mirror: true,
                glowMix: hc.active ? 0 : (theme === "dark" ? 55 : 0),
                muted: false,
            });

            const data = parseDataView(dv);
            if (!data || data.rows.length === 0) {
                this.container.selectAll("*").remove();
                this.backgroundRect.attr("width", 0).attr("height", 0);
                this.rowSelectionIds = [];
                this.cornerSignature?.update(hc.active ? hc.color : accentToken(theme), {
                    variant: "cornerBracket", mirror: true, muted: true,
                });
                this.events.renderingFinished(options);
                return;
            }

            // Build selection IDs per row
            const categories = dv.categorical?.categories?.[0];
            this.categoricalCategories = categories;
            this.rowSelectionIds = [];
            if (categories) {
                for (let i = 0; i < categories.values.length; i++) {
                    this.rowSelectionIds.push(
                        this.host.createSelectionIdBuilder()
                            .withCategory(categories, i)
                            .createSelectionId()
                    );
                }
            }

            // ─── Conditional formatting (fx) wiring — Total Colour
            // (TRANS-04). A bare `instanceKind: ConstantOrRule` in
            // settings.ts does not make the fx button functional on its own
            // — it also needs a `selector` (dataViewWildcard, so a rule can
            // match this measure's category instances/totals) and an
            // `altConstantSelector` bound to a concrete selectionId for the
            // "set for all" swatch edit path. Resolved per-row at render via
            // ColorHelper.getColorForMeasure against each category's own
            // per-instance object overrides (categoricalCategories.objects[rowIndex]).
            const s = this.formattingSettings.timeBreakdownCard;
            s.totalColor.selector = dataViewWildcard.createDataViewWildcardSelector(
                dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
            );
            s.totalColor.altConstantSelector = this.rowSelectionIds[0]
                ? this.rowSelectionIds[0].getSelector()
                : undefined;
            this.totalColorHelper = new ColorHelper(
                this.host.colorPalette,
                { objectName: "timeBreakdownStyle", propertyName: "totalColor" },
                s.totalColor.value.value
            );

            // ─── Conditional formatting (fx) wiring — Category Label
            // Colour (TEXT-02). Same wildcard-selector + altConstantSelector
            // + ColorHelper.getColorForMeasure pattern as Total Colour
            // above, resolved per-row against each category's own
            // per-instance object overrides.
            s.categoryColor.selector = dataViewWildcard.createDataViewWildcardSelector(
                dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
            );
            s.categoryColor.altConstantSelector = this.rowSelectionIds[0]
                ? this.rowSelectionIds[0].getSelector()
                : undefined;
            this.categoryColorHelper = new ColorHelper(
                this.host.colorPalette,
                { objectName: "timeBreakdownStyle", propertyName: "categoryColor" },
                s.categoryColor.value.value
            );

            const w = options.viewport.width;
            const h = options.viewport.height;
            // Set viewport size on scroll container; render will compute actual content size
            this.scrollContainer.style("width", w + "px").style("height", h + "px");

            const contentH = this.render(data, w, theme, hc);
            // Size SVG to actual content so scroll container shows scrollbars when needed
            this.svg.attr("width", w).attr("height", contentH);

            // ─── Dedicated background layer (D-05) ─────────────────────
            // Suite-wide shared Background card (Colour + Transparency,
            // sourced from _shared/formatting/), painted as a persistent
            // SVG rect (first child, behind `this.container`) — never
            // whole-root/target opacity. Its transparency default is
            // overridden to 100 in settings.ts specifically so an OLD saved
            // report (this property never previously existed) renders
            // alpha 0 — pixel-identical to painting nothing (D-06) — while
            // still exposing a real, working Colour + Transparency control.
            const background = this.formattingSettings.background;
            const bgHex = background.backgroundColor.value?.value ?? "#ffffff";
            const bgTransparencyPct = background.transparency.value ?? 100;
            this.backgroundRect
                .attr("width", w)
                .attr("height", contentH)
                .attr("fill", this.isHighContrast ? "none" : toRgba(bgHex, bgTransparencyPct));

            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
        }
    }

    private render(data: TimeBreakdownData, width: number, theme: Theme = "dark", hc: ReturnType<typeof applyHighContrast> = applyHighContrast(null)): number {
        this.container.selectAll("*").remove();

        const s = this.formattingSettings.timeBreakdownCard;
        const barHeight = s.barHeight.value;
        const barRadius = s.barRadius.value;
        // v2 LED-gap inner radius (§5) — smaller than the user's own
        // "outer cap" barRadius so a run of segments reads as LED
        // blocks with a 1px gap, while the true outer ends of the whole
        // run (the very first segment's left corners, the very last
        // segment's right corners) keep the fuller barRadius the user
        // already controls (D-16).
        const ledInnerRadius = Math.min(2, barRadius);
        const ledGap = 1;

        // ─── v2 degradation ladder (§7): callouts -> labels -> title, as
        // the tile shrinks. Each rung only SUPPRESSES a surface that is
        // otherwise on; it never overrides an already-off toggle (D-16).
        const degradeCallouts = width < 260;   // in-segment value/label callouts hide first
        const degradeLabels = width < 200;     // legend + axis titles hide next
        const degradeTitle = width < 140;      // visual title hides last
        const rowSpacing = s.rowSpacing.value;
        const opacity = this.isHighContrast ? 1 : Math.min(100, Math.max(0, s.segmentOpacity.value)) / 100;
        const unit = s.valueUnit.value || "";
        const catFontSize = s.categoryFontSize.value;
        const valFontSize = s.valueFontSize.value;
        const totalColorDefault = s.totalColor.value.value;

        // ─── Text treatment (font family/weight/style/decoration,
        // TEXT-01/TEXT-02) — each `?? default` fallback reproduces this
        // visual's PRE-EXISTING hardcoded style exactly when an old saved
        // report has none of these new properties set (D-06):
        //   category: was hardcoded font-weight 600 -> categoryBold defaults false
        //   segment label/value: was hardcoded 500   -> valueBold defaults false
        //   total: was hardcoded 700                 -> totalBold defaults true
        // "Bold" renders 700; "not bold" renders each surface's own
        // pre-existing rest-weight, not a flat 400.
        const weightFor = (bold: boolean | undefined, restWeight: string): string => bold ? "700" : restWeight;

        const catFontFamily = s.categoryFontFamily.value || "Segoe UI, sans-serif";
        const catWeight = weightFor(s.categoryBold.value, "600");
        const catStyle = s.categoryItalic.value ? "italic" : "normal";
        const catDecoration = s.categoryUnderline.value ? "underline" : "none";

        const valFontFamily = s.valueFontFamily.value || "Segoe UI, sans-serif";
        const valWeight = weightFor(s.valueBold.value, "500");
        const valStyle = s.valueItalic.value ? "italic" : "normal";
        const valDecoration = s.valueUnderline.value ? "underline" : "none";

        const totalFontSize = s.totalFontSize.value;
        const totalFontFamily = s.totalFontFamily.value || "Segoe UI, sans-serif";
        const totalWeight = weightFor(s.totalBold.value, "700");
        const totalStyle = s.totalItalic.value ? "italic" : "normal";
        const totalDecoration = s.totalUnderline.value ? "underline" : "none";

        // Dead Time Segment (§2/§5, genuinely optional — "none" default
        // preserves pre-plan behaviour exactly): the one marked segment
        // renders the shared muted/unit-token grey instead of its
        // categorical-ramp colour ("Wait is deliberately grey — dead time
        // shouldn't get a hero colour"), regardless of its own ColorPicker.
        const deadTimeIndex = { none: -1, segment1: 0, segment2: 1, segment3: 2 }
            [String(s.deadTimeSegment.value?.value || "none")] ?? -1;
        const deadTimeGrey = surfaceTokens(theme).muted;

        const segmentConfigs = this.isHighContrast
            ? [
                { color: this.highContrastForeground, label: s.segment1Label.value },
                { color: this.highContrastForeground, label: s.segment2Label.value },
                { color: this.highContrastForeground, label: s.segment3Label.value },
            ]
            : [
                { color: deadTimeIndex === 0 ? deadTimeGrey : s.segment1Color.value.value, label: s.segment1Label.value },
                { color: deadTimeIndex === 1 ? deadTimeGrey : s.segment2Color.value.value, label: s.segment2Label.value },
                { color: deadTimeIndex === 2 ? deadTimeGrey : s.segment3Color.value.value, label: s.segment3Label.value },
            ];

        // ─── Visual Title (iframe-internal, Policy 1180.2.5) ───────────
        // Reserves vertical space above the rows when shown; shares
        // margin.top with the pre-existing 8px breathing room.
        const titleFmt = this.formattingSettings.titleSettings;
        // v2 degradation ladder (§7): the title is the LAST thing to
        // hide as the tile shrinks (after callouts, then legend/axis
        // titles) — see degradeTitle above.
        const showTitle = !!titleFmt.showTitle.value && !!titleFmt.titleText.value && !degradeTitle;
        const titleFontSize = titleFmt.titleFontSize.value || 14;
        const titleH = showTitle ? titleFontSize + 12 : 0;

        // Layout
        const margin = { top: 8 + titleH, right: 60, bottom: 30, left: 12 };
        const trackWidth = width - margin.left - margin.right;
        const maxTotal = data.maxTotal || 1;

        if (showTitle) {
            const tAlign = textAlignFor(String((titleFmt as any).titleAlign?.value || "left"));
            const x = tAlign === "center" ? width / 2 : tAlign === "right" ? width - margin.left : margin.left;
            const anchor = tAlign === "center" ? "middle" : tAlign === "right" ? "end" : "start";
            this.titleEl
                .attr("x", x)
                .attr("y", titleFontSize + 4)
                .attr("text-anchor", anchor)
                .style("font-family", titleFmt.titleFontFamily.value || "Segoe UI, sans-serif")
                .style("font-size", `${titleFontSize}px`)
                .style("font-weight", titleFmt.titleBold.value ? "700" : "400")
                .style("font-style", titleFmt.titleItalic.value ? "italic" : "normal")
                .style("text-decoration", titleFmt.titleUnderline.value ? "underline" : "none")
                .style("fill", this.isHighContrast ? this.highContrastForeground : titleFmt.titleColor.value.value)
                .text(String(titleFmt.titleText.value))
                .style("display", null);
        } else {
            this.titleEl.style("display", "none");
        }

        // Legend height — degraded (hidden) before the title as the tile
        // shrinks (§7: callouts -> labels/legend -> title).
        const showLegendResolved = s.showLegend.value && !degradeLabels;
        const legendH = showLegendResolved ? 24 : 0;

        let yOffset = margin.top;

        // Rows
        data.rows.forEach((row: TimeBreakdownRow, rowIndex: number) => {
            const rowG = this.container.append("g")
                .attr("transform", `translate(${margin.left}, ${yOffset})`);

            // Per-row Total Colour resolution (TRANS-04 fx): reads the
            // rule-evaluated fill (if a rule is set) via the official
            // ColorHelper.getColorForMeasure path against this row's own
            // per-instance object overrides, falling back to the static
            // format-pane value otherwise.
            const instanceObjects = this.categoricalCategories?.objects?.[rowIndex];
            const resolvedTotalColor = this.totalColorHelper?.getColorForMeasure(instanceObjects, "totalColor") ?? totalColorDefault;
            const totalColor = this.isHighContrast ? this.highContrastForeground : resolvedTotalColor;

            // Per-row Category Label Colour resolution (TEXT-02 fx): same
            // pattern as Total Colour above.
            const resolvedCategoryColor = this.categoryColorHelper?.getColorForMeasure(instanceObjects, "categoryColor") ?? s.categoryColor.value.value;
            const catColor = this.isHighContrast ? this.highContrastForeground : resolvedCategoryColor;

            // Category label
            rowG.append("text")
                .attr("x", 0)
                .attr("y", 0)
                .attr("dy", "0.9em")
                .attr("font-size", `${catFontSize}px`)
                .attr("font-family", catFontFamily)
                .style("font-weight", catWeight)
                .style("font-style", catStyle)
                .style("text-decoration", catDecoration)
                .attr("fill", catColor)
                .text(row.category);

            const barY = catFontSize + 4;
            let xPos = 0;

            // Segments — categorical ramp fill (segmentConfigs above),
            // rendered as a rounded-corner PATH (not a plain <rect>) so
            // the LED-gap rhythm can carry a BIGGER radius only on the
            // true outer ends of the whole run (this row's first
            // segment's left corners, last segment's right corners) and
            // a smaller LED radius on every inner-adjacent edge (§5).
            row.segments.forEach((seg, segIdx) => {
                const segW = (seg.value / maxTotal) * trackWidth;
                const cfg = segmentConfigs[seg.roleIndex] || segmentConfigs[0];
                const isFirst = segIdx === 0;
                const isLast = segIdx === row.segments.length - 1;
                const rLeft = isFirst ? barRadius : ledInnerRadius;
                const rRight = isLast ? barRadius : ledInnerRadius;
                // 1px LED gap trimmed from the trailing (right) edge only
                // — the next segment's own xPos is untouched, so the gap
                // appears between the two without disturbing the
                // cumulative total-label math below.
                const renderedW = isLast ? Math.max(0, segW) : Math.max(0, segW - ledGap);

                // Segment path (rounded-rect with per-corner radius)
                rowG.append("path")
                    .attr("d", roundedRectPath(xPos, barY, Math.max(renderedW, 0.01), barHeight, rLeft, rRight, rRight, rLeft))
                    .attr("fill", cfg.color)
                    .attr("opacity", opacity);

                // Segment label + value text — suppressed first in the
                // degradation ladder (§7) even when the tile has room for
                // an individual segment's own segW > 30 threshold.
                const showLabel = s.showSegmentLabels.value && !degradeCallouts;
                const showValue = s.showSegmentValues.value && !degradeCallouts;
                if ((showLabel || showValue) && segW > 30) {
                    const parts: string[] = [];
                    if (showLabel) parts.push(cfg.label);
                    if (showValue) parts.push(`${Math.round(seg.value)}${unit}`);
                    const labelText = parts.join(" ");
                    rowG.append("text")
                        .attr("x", xPos + segW / 2)
                        .attr("y", barY + barHeight / 2)
                        .attr("dy", "0.35em")
                        .attr("text-anchor", "middle")
                        .attr("font-size", `${valFontSize}px`)
                        .attr("font-family", valFontFamily)
                        .style("font-weight", valWeight)
                        .style("font-style", valStyle)
                        .style("text-decoration", valDecoration)
                        .style("font-feature-settings", TABULAR_NUMS)
                        .attr("fill", this.contrastText(cfg.color))
                        .text(labelText);
                } else if ((showLabel || showValue) && segW > 0) {
                    // Too narrow — place above
                    const parts: string[] = [];
                    if (showLabel) parts.push(cfg.label);
                    if (showValue) parts.push(`${Math.round(seg.value)}${unit}`);
                    const labelText = parts.join(" ");
                    rowG.append("text")
                        .attr("x", xPos + segW / 2)
                        .attr("y", barY - 2)
                        .attr("text-anchor", "middle")
                        .attr("font-size", `${valFontSize - 1}px`)
                        .attr("font-family", valFontFamily)
                        .style("font-weight", valWeight)
                        .style("font-style", valStyle)
                        .style("text-decoration", valDecoration)
                        .style("font-feature-settings", TABULAR_NUMS)
                        .attr("fill", cfg.color)
                        .text(labelText);
                }

                xPos += segW;
            });

            // Total label at end — settles via the shared motion helper
            // (§6) once per category when its displayed text changes,
            // capped at MOTION_MAX_MS and skipped under
            // prefers-reduced-motion internally.
            if (s.showTotalLabel.value) {
                const totalVal = row.total ?? row.segments.reduce((sum, seg) => sum + seg.value, 0);
                const totalText = `${Math.round(totalVal)} ${unit}`;
                const totalEl = rowG.append("text")
                    .attr("x", xPos + 8)
                    .attr("y", barY + barHeight / 2)
                    .attr("dy", "0.35em")
                    .attr("font-size", `${totalFontSize}px`)
                    .attr("font-family", totalFontFamily)
                    .style("font-weight", totalWeight)
                    .style("font-style", totalStyle)
                    .style("text-decoration", totalDecoration)
                    .style("font-feature-settings", TABULAR_NUMS)
                    .attr("fill", totalColor)
                    .text(totalText);

                if (this.lastTotalByCategory.get(row.category) !== totalText) {
                    settle(totalEl.node() as unknown as SVGElement, [
                        { opacity: 0.35, transform: "translateY(2px)" },
                        { opacity: 1, transform: "translateY(0)" },
                    ], { duration: Math.min(200, MOTION_MAX_MS) });
                    this.lastTotalByCategory.set(row.category, totalText);
                }
            }

            // Invisible hit rect for tooltip and cross-filtering
            const hitRect = rowG.append("rect")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", trackWidth + 60)
                .attr("height", catFontSize + 4 + barHeight)
                .attr("fill", "transparent")
                .style("cursor", "pointer");

            const tooltipItems: VisualTooltipDataItem[] = [
                { displayName: "Category", value: row.category }
            ];
            row.segments.forEach((seg) => {
                const cfg = segmentConfigs[seg.roleIndex] || segmentConfigs[0];
                tooltipItems.push({
                    displayName: cfg.label,
                    value: `${Math.round(seg.value)}${unit}`
                });
            });
            const totalVal = row.total ?? row.segments.reduce((sum, seg) => sum + seg.value, 0);
            tooltipItems.push({ displayName: "Total", value: `${Math.round(totalVal)}${unit}` });

            const hitNode = hitRect.node() as SVGRectElement;
            hitNode.addEventListener("mousemove", (e: MouseEvent) => {
                this.tooltipService.show({
                    coordinates: [e.clientX, e.clientY],
                    isTouchEvent: false,
                    dataItems: tooltipItems,
                    identities: this.rowSelectionIds[rowIndex] ? [this.rowSelectionIds[rowIndex]] : []
                });
            });
            hitNode.addEventListener("mouseleave", () => {
                this.tooltipService.hide({ isTouchEvent: false, immediately: false });
            });
            hitNode.addEventListener("click", (e: MouseEvent) => {
                if (this.rowSelectionIds[rowIndex]) {
                    this.selectionManager.select(this.rowSelectionIds[rowIndex], e.ctrlKey || e.metaKey);
                }
                e.stopPropagation();
            });

            yOffset += catFontSize + 4 + barHeight + rowSpacing;
        });

        // Axis titles (X = time values, Y = categories) — degraded
        // (hidden) before the title as the tile shrinks (§7).
        const axisS = this.formattingSettings.axisSettingsCard;
        const showAxisTitles = axisS.showAxisTitles.value && !degradeLabels;
        const xAxisTitle = axisS.xAxisTitle.value || "";
        const yAxisTitle = axisS.yAxisTitle.value || "";
        if (showAxisTitles) {
            const axisTitleFontSize = catFontSize;
            // Axis titles are out of this plan's per-surface text-treatment
            // scope (interfaces limit this task to category/segment/total
            // labels) — kept on the static Category Label Colour swatch,
            // unchanged from pre-plan behaviour.
            const titleColor = this.isHighContrast ? this.highContrastForeground : s.categoryColor.value.value;
            if (xAxisTitle) {
                this.container.append("text")
                    .classed("axis-title x-axis-title", true)
                    .attr("x", margin.left + trackWidth / 2)
                    .attr("y", yOffset + (showLegendResolved ? 0 : 8))
                    .attr("text-anchor", "middle")
                    .attr("font-size", axisTitleFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", titleColor)
                    .attr("font-family", "Segoe UI, sans-serif")
                    .text(xAxisTitle);
                yOffset += axisTitleFontSize + 6;
            }
            if (yAxisTitle) {
                const chartMidY = margin.top + (yOffset - margin.top) / 2;
                this.container.append("text")
                    .classed("axis-title y-axis-title", true)
                    .attr("x", -chartMidY)
                    .attr("y", 12)
                    .attr("text-anchor", "middle")
                    .attr("transform", "rotate(-90)")
                    .attr("font-size", axisTitleFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", titleColor)
                    .attr("font-family", "Segoe UI, sans-serif")
                    .text(yAxisTitle);
            }
        }

        // Legend
        if (showLegendResolved) {
            const usedSegments = new Set<number>();
            data.rows.forEach(row => row.segments.forEach(seg => usedSegments.add(seg.roleIndex)));

            const legendG = this.container.append("g")
                .attr("transform", `translate(${margin.left}, ${yOffset})`);

            let lx = 0;
            usedSegments.forEach((idx) => {
                const cfg = segmentConfigs[idx];
                if (!cfg) return;

                legendG.append("rect")
                    .attr("x", lx)
                    .attr("y", 0)
                    .attr("width", 10)
                    .attr("height", 10)
                    .attr("rx", 2)
                    .attr("fill", cfg.color)
                    .attr("opacity", opacity);

                // Legend swatches are out of this plan's per-surface scope —
                // kept on the static Category Label Colour swatch, unchanged.
                const label = legendG.append("text")
                    .attr("x", lx + 14)
                    .attr("y", 5)
                    .attr("dy", "0.35em")
                    .attr("font-size", "10px")
                    .attr("font-family", "Segoe UI, sans-serif")
                    .attr("fill", this.isHighContrast ? this.highContrastForeground : s.categoryColor.value.value)
                    .text(cfg.label);

                const bbox = (label.node() as SVGTextElement).getBBox();
                lx += 14 + bbox.width + 16;
            });
        }
        return yOffset;
    }

    private contrastText(bgHex: string): string {
        if (this.isHighContrast) return this.highContrastBackground;
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(bgHex);
        if (!m) return "#000000";
        const r = parseInt(m[1], 16);
        const g = parseInt(m[2], 16);
        const b = parseInt(m[3], 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.55 ? "#000000" : "#ffffff";
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        this.cornerSignature?.destroy();
        this.cornerSignature = null;
        this.container?.selectAll("*").remove();
        this.svg?.remove();
        this.container = null;
        this.svg = null;
    }
}
