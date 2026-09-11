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
import { toRgba, compositeOver, surfaceTone, contrastInk, contrastRatio, mutedInk } from "./shared/colorHelpers";
import { formatModelNumber, fractionDigitsFor } from "./shared/numberFormat";

// v3 appearance engine (frozen, 01-15) — accent token, dim-theme
// surfaces, the corner-bracket card signature, the capped/reduced-
// motion-aware settle() helper, and the single HC fallback rule.
// Consumed read-only (D-11). Segment colours themselves resolve through
// the EXISTING segment1/2/3Color pickers (their static defaults now ship
// the v3 categorical ramp — spectrumRamp(index, 3) — see settings.ts);
// this file never forks a second categorical-ramp computation.
import { Theme, accentToken, bandColor } from "./shared/bandEngine";
import { surfaceTokens, TABULAR_NUMS } from "./shared/designTokens";
import { makeCornerBrackets, CardSignatureHandle } from "./shared/cardSignature";
import { applyCardSignature } from "./shared/cardSignatureSettings";
import { resolveBorder } from "./shared/borderSettings";
import { settle, MOTION_MAX_MS } from "./shared/motion";
import { applyHighContrast } from "./shared/highContrast";

import * as d3 from "d3";
import { LicenseGate } from "./shared/licensing";

/**
 * Shown wherever the data provides no duration to report (NEXUS cycle-13 §3).
 * An absent reading is a gap, never a measured zero — an all-blank row and an
 * observed all-zero row must not print the same "0 min".
 */
const NO_VALUE = "—";

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
    private host: IVisualHost & { allowInteractions?: boolean };
    private target: HTMLElement;
    private scrollContainer: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private backgroundRect: d3.Selection<SVGRectElement, unknown, null, undefined>;
    private borderRect: d3.Selection<SVGRectElement, unknown, null, undefined>;
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
    private surfaceHex: string = "#ffffff";

    // State for tooltips and cross-filtering
    private rowSelectionIds: ISelectionId[] = [];
    private categoricalCategories: powerbi.DataViewCategoryColumn | undefined;
    private totalColorHelper: ColorHelper | null = null;
    // Conditional formatting (fx) state — Category label colour (TEXT-02).
    private categoryColorHelper: ColorHelper | null = null;
    private segmentColorHelpers: ColorHelper[] = [];

    // v3 card signature — one accent-tinted corner-bracket pair for the
    // whole card (a multi-row list visual, like Progress Bar Card/Now vs
    // Then — the accent cyan is the card's own identity, distinct from
    // any segment's categorical colour).
    private cornerSignature: CardSignatureHandle | null = null;

    // v3 motion — only re-settles a row's total label when its displayed
    // text changes, tracked per category so a full-rebuild render()
    // doesn't replay the settle animation on every update.
    private lastTotalByCategory: Map<string, string> = new Map();

    private licenseGate: LicenseGate;

    private lastUpdateOptions: VisualUpdateOptions | null = null;
    private destroyed = false;


    constructor(options: VisualConstructorOptions) {

        // NO FREE TIER — an unlicensed user gets the whole visual blocked.

        // The check is async, so re-run the last update once it resolves.

        this.licenseGate = new LicenseGate(options.host, () => {

            if (this.lastUpdateOptions) this.update(this.lastUpdateOptions);

        });
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
            .attr("class", "time-breakdown")
            // Block-level so the SVG has no inline descender gap: when its
            // height exactly equals the scroll container (tile-fill case) an
            // inline SVG's baseline whitespace overflows by a few px and
            // spuriously triggers BOTH scrollbars.
            .style("display", "block");

        // Dedicated background layer (D-05) — persistent SVG rect, first
        // child so it never paints over row/legend content. Never whole-
        // root/target opacity.
        this.backgroundRect = this.svg.append("rect").attr("class", "time-breakdown-bg");

        // Iframe-internal title (Policy 1180.2.5) — persistent SVG text,
        // shown/hidden per update() via showTitle/titleText (D-14).
        this.titleEl = this.svg.append("text").attr("class", "time-breakdown-title");

        this.container = this.svg.append("g");
        // Visual's own Border card — a stroke-rect sibling appended AFTER the
        // content <g> so it frames on top; sized/styled per render. (Content is
        // cleared via container.selectAll, so this persistent rect survives.)
        this.borderRect = this.svg.append("rect").attr("class", "time-breakdown-border").attr("fill", "none").style("display", "none");

        // Corner-bracket card signature — accent-tinted (the card's own
        // cyan identity, not any single segment's categorical colour),
        // appended to the scroll container (an HTML overlay above the
        // SVG, pointer-events:none) so it paints above every row.
        const initialHc = applyHighContrast(this.host.colorPalette, { fallbackColor: accentToken("dark") });
        this.cornerSignature = makeCornerBrackets(
            this.scrollContainer.node() as HTMLElement,
            initialHc.color,
            { variant: "cornerBracket", mirror: true }
        );
        applyCardSignature(this.cornerSignature, undefined, {
            autoHex: initialHc.color, hcActive: initialHc.active, hcColor: initialHc.color, mirror: true,
        });

        // Context menu
        d3.select(this.target)
            .on("contextmenu.timeBreakdown", (e: MouseEvent) => {
                if (this.host.allowInteractions !== false) {
                    this.selectionManager.showContextMenu({} as ISelectionId, { x: e.clientX, y: e.clientY });
                }
                e.preventDefault();
            })
            .on("click.timeBreakdown", () => {
                if (this.host.allowInteractions !== false) this.selectionManager.clear().then(() => this.applySelection());
            });

        this.selectionManager.registerOnSelectCallback(ids => this.applySelection(ids));
        this.svg.attr("role", "listbox").attr("aria-label", "Time breakdown").attr("aria-multiselectable", "true");
    }

    public update(options: VisualUpdateOptions): void {
        if (this.destroyed) return;
        this.events.renderingStarted(options);
        this.lastUpdateOptions = options;

        if (this.licenseGate.blockedThisFrame()) {
            this.target.style.display = "none";
            this.events.renderingFinished(options);
            return;
        }
        this.target.style.display = "";
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
            this.formattingSettings = this.formattingSettingsService
                .populateFormattingSettingsModel(VisualFormattingSettingsModel, dv ?? { metadata: { columns: [] } });

            // ─── v3 theme pick + single HC fallback rule, computed once
            // and reused everywhere colour is resolved below (§8, D-16:
            // this visual's own Background card is the source of truth
            // for whether the card reads as a dark or light surface).
            const bgSettingsForTheme = this.formattingSettings.background;
            const bgHexForTheme = bgSettingsForTheme.backgroundColor.value?.value ?? "#ffffff";
            const bgTransparencyForTheme = bgSettingsForTheme.transparency.value ?? 100;
            this.surfaceHex = this.isHighContrast ? this.highContrastBackground
                : compositeOver(bgHexForTheme, bgTransparencyForTheme, colorPalette.background?.value ?? "#ffffff");
            const theme: Theme = surfaceTone(this.surfaceHex);
            const hc = applyHighContrast(colorPalette, { fallbackColor: accentToken(theme) });

            applyCardSignature(this.cornerSignature, this.formattingSettings.cardSignature, {
                autoHex: accentToken(theme),
                hcActive: hc.active,
                hcColor: hc.color,
                mirror: true,
                glowMix: hc.active ? 0 : (theme === "dark" ? 55 : 0),
                muted: false,
            });

            const data = parseDataView(dv);
            if (!data || data.rows.length === 0) {
                this.renderEmpty(options, theme, hc);
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
            s.totalColor.altConstantSelector = undefined; // card-level constant persistence: swatch edits apply to ALL instances + round-trip into the pane (first-instance binding persisted a row-0-only override); fx rules stay per-instance via the wildcard selector;
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
            s.categoryColor.altConstantSelector = undefined; // card-level constant persistence: swatch edits apply to ALL instances + round-trip into the pane (first-instance binding persisted a row-0-only override); fx rules stay per-instance via the wildcard selector;
            this.categoryColorHelper = new ColorHelper(
                this.host.colorPalette,
                { objectName: "timeBreakdownStyle", propertyName: "categoryColor" },
                s.categoryColor.value.value
            );
            this.segmentColorHelpers = [s.segment1Color, s.segment2Color, s.segment3Color].map((slice, index) => {
                slice.selector = dataViewWildcard.createDataViewWildcardSelector(
                    dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
                );
                slice.altConstantSelector = undefined;
                return new ColorHelper(this.host.colorPalette,
                    { objectName: "timeBreakdownStyle", propertyName: `segment${index + 1}Color` }, slice.value.value);
            });

            const w = Math.max(0, options.viewport.width);
            const h = Math.max(0, options.viewport.height);
            // Set viewport size on scroll container; render will compute actual content size
            this.scrollContainer.style("width", w + "px").style("height", h + "px");

            const contentH = this.render(data, w, theme, hc);
            this.applySelection();
            // Fill the tile ("flexible like all the others"): when the natural
            // content is SHORTER than the viewport, stretch the card (svg +
            // background + border) to the full height so there's no dead
            // bottom strip; when TALLER, keep contentH so the scroll container
            // shows scrollbars.
            const fillH = Math.max(contentH, h);
            this.svg.attr("width", w).attr("height", fillH);

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
                .attr("height", fillH)
                .attr("fill", this.isHighContrast ? this.highContrastBackground : toRgba(bgHex, bgTransparencyPct));

            // Visual's own Border card — stroke-rect framing the visual; inset
            // by half the width so the stroke isn't clipped at the tile edge.
            const b = resolveBorder(this.formattingSettings.visualBorder, {
                hcActive: this.isHighContrast,
                hcColor: this.highContrastForeground,
                palette: this.host.colorPalette,
                metadataObjects: options.dataViews?.[0]?.metadata?.objects,
            });
            if (b) {
                const inset = b.width / 2;
                this.borderRect
                    .attr("x", inset).attr("y", inset)
                    .attr("width", Math.max(0, w - b.width)).attr("height", Math.max(0, fillH - b.width))
                    .attr("rx", b.radius).attr("ry", b.radius)
                    .attr("stroke", b.colorCss).attr("stroke-width", b.width)
                    .style("display", null);
            } else {
                this.borderRect.style("display", "none");
            }

            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
        }
    }

    private applySelection(ids = this.selectionManager.getSelectionIds()): void {
        if (this.destroyed) return;
        const keys = new Set(ids.map(id => (id as ISelectionId).getKey()));
        const hc = this.isHighContrast;
        const selectedInk = (this.host.colorPalette as any).foregroundSelected?.value ?? this.highContrastForeground;
        this.container?.selectAll<SVGGElement, unknown>("g[data-key]").each(function() {
            const selected = keys.has(this.getAttribute("data-key"));
            d3.select(this).style("opacity", hc || keys.size === 0 || selected ? 1 : 0.35)
                .attr("aria-selected", String(selected));
            d3.select(this).select(".time-breakdown-hit")
                .attr("stroke", hc && selected ? selectedInk : "none")
                .attr("stroke-width", hc && selected ? 1 : 0);
        });
    }

    private renderEmpty(options: VisualUpdateOptions, theme: Theme, hc: ReturnType<typeof applyHighContrast>): void {
        const w = Math.max(0, options.viewport.width), h = Math.max(0, options.viewport.height);
        this.container.selectAll("*").on(".timeBreakdown", null).remove();
        this.rowSelectionIds = [];
        this.categoricalCategories = undefined;
        this.categoryColorHelper = this.totalColorHelper = null;
        this.segmentColorHelpers = [];
        this.lastTotalByCategory.clear();
        this.titleEl.text("").style("display", "none");
        this.borderRect.style("display", "none");
        this.scrollContainer.style("width", w + "px").style("height", h + "px");
        this.svg.attr("width", w).attr("height", h);
        const background = this.formattingSettings.background;
        this.backgroundRect.attr("width", w).attr("height", h)
            .attr("fill", this.isHighContrast ? this.highContrastBackground
                : toRgba(background.backgroundColor.value.value, background.transparency.value));
        if (w >= 50 && h >= 16) {
            this.container.append("text").attr("class", "time-breakdown-empty")
                .attr("x", w / 2).attr("y", Math.min(24, h / 2)).attr("dy", "0.35em")
                .attr("text-anchor", "middle").attr("font-family", "Segoe UI, sans-serif").attr("font-size", 12)
                .attr("fill", this.isHighContrast ? this.highContrastForeground : this.adaptiveInk())
                .text("No data");
        }
        applyCardSignature(this.cornerSignature, this.formattingSettings.cardSignature, {
            autoHex: accentToken(theme), hcActive: hc.active, hcColor: hc.color, mirror: true, muted: true,
        });
    }

    private render(data: TimeBreakdownData, width: number, theme: Theme = "dark", hc: ReturnType<typeof applyHighContrast> = applyHighContrast(null)): number {
        this.container.selectAll("*").on(".timeBreakdown", null).remove();

        const s = this.formattingSettings.timeBreakdownCard;
        const barHeight = Math.max(1, s.barHeight.value);
        const barRadius = Math.max(0, s.barRadius.value);
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
        const rowSpacing = Math.max(0, s.rowSpacing.value);
        const opacity = this.isHighContrast ? 1 : Math.min(100, Math.max(0, s.segmentOpacity.value)) / 100;
        const unit = s.valueUnit.value || "";
        const catFontSize = Math.max(1, s.categoryFontSize.value);
        const valFontSize = Math.max(1, s.valueFontSize.value);
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

        const totalFontSize = Math.max(1, s.totalFontSize.value);
        const totalFontFamily = s.totalFontFamily.value || "Segoe UI, sans-serif";
        const totalWeight = weightFor(s.totalBold.value, "400");
        const totalStyle = s.totalItalic.value ? "italic" : "normal";
        const totalDecoration = s.totalUnderline.value ? "underline" : "none";
        const measure = (text: string, size: number, family: string, weight: string, style = "normal"): number => {
            const label = this.container.append("text").attr("font-size", size).attr("font-family", family)
                .style("font-weight", weight).style("font-style", style).text(text);
            const result = label.node().getBBox().width;
            label.remove();
            return result;
        };

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

        // ─── Total · Δ delta chip (board v2) — a pill after each row's total
        // showing that scenario's % difference from the FIRST row (baseline):
        // lime = less time (saved), magenta = more time (added), grey =
        // baseline. Reserves extra right-margin so total+chip fit; hidden with
        // the other callouts on narrow tiles and when there's only one row
        // (nothing to compare against).
        let showDelta = s.showDeltaChip.value && s.showTotalLabel.value
            && data.rows.length > 1 && !degradeCallouts;

        // Layout — reserve a left gutter for the rotated Y-axis title so it
        // doesn't collide with the bars/category labels ("axis titles snug").
        const axisCfg = this.formattingSettings.axisSettingsCard;
        const hasYTitle = axisCfg.showAxisTitles.value && !degradeLabels && !!axisCfg.yAxisTitle.value;
        const margin = { top: 8 + titleH, right: 12, bottom: 30, left: Math.min(width / 2, hasYTitle ? 30 : 12) };
        const maxTotal = data.maxTotal || 1;
        // §3: the baseline row's own total, which may not exist at all — a row
        // with no duration reading has no total to be a reference for, and
        // re-summing its (empty) segments here would reintroduce the asserted
        // zero the parser now refuses to invent.
        const baselineTotal: number | null = data.rows[0]
            ? (data.rows[0].total ?? data.rows[0].derivedTotal)
            : null;
        const hasBaseline = baselineTotal !== null && baselineTotal > 0;
        const totalTextFor = (row: TimeBreakdownRow): string => {
            const total = row.total ?? row.derivedTotal;
            return total !== null && Number.isFinite(total)
                ? `${this.formatDuration(total, data.totalFormat)}${unit ? " " + unit : ""}${row.totalMismatch || row.invalidDuration ? " !" : ""}`
                : row.invalidDuration ? "Invalid duration" : NO_VALUE;
        };
        const deltaTextFor = (row: TimeBreakdownRow, index: number): string => {
            if (index === 0) return "baseline";
            if (!hasBaseline) return "N/A";
            const delta = ((row.total ?? row.derivedTotal) - baselineTotal) / baselineTotal * 100;
            return Math.round(delta) === 0 ? "0%" : (delta < 0 ? "−" : "+") + Math.abs(delta).toFixed(0) + "%";
        };
        if (s.showTotalLabel.value) {
            margin.right += Math.max(...data.rows.map((row, index) => 8
                + measure(totalTextFor(row), totalFontSize, totalFontFamily, totalWeight, totalStyle)
                + (showDelta && (row.total ?? row.derivedTotal) !== null
                    ? 18 + measure(deltaTextFor(row, index), 11, "Segoe UI, sans-serif", "700") : 0)));
        }
        // If the end-label reservation leaves no useful track, move totals
        // below the bars. Both arrangements retain a shared, nonnegative scale.
        const totalsBelow = width - margin.left - margin.right < 24;
        if (totalsBelow) {
            margin.right = Math.min(12, width / 2);
            showDelta = false;
        }
        const trackWidth = Math.max(0, width - margin.left - margin.right);
        const rowWidth = Math.max(0, width - margin.left - Math.min(12, width / 2));

        if (showTitle) {
            const tAlign = textAlignFor(String((titleFmt as any).titleAlign?.value || "left"));
            const x = tAlign === "center" ? width / 2 : tAlign === "right" ? width - margin.left : margin.left;
            const anchor = tAlign === "center" ? "middle" : tAlign === "right" ? "end" : "start";
            // Adaptive default (D-16 sentinel): untouched shared-Title navy
            // swaps to the dark text token on dark surfaces.
            const setTitle = titleFmt.titleColor.value.value;
            const adaptiveTitle = setTitle === "#1a1a2e" ? this.adaptiveInk(setTitle) : setTitle;
            this.titleEl
                .attr("x", x)
                .attr("y", titleFontSize + 4)
                .attr("text-anchor", anchor)
                .style("font-family", titleFmt.titleFontFamily.value || "Segoe UI, sans-serif")
                .style("font-size", `${titleFontSize}px`)
                .style("font-weight", titleFmt.titleBold.value ? "700" : "400")
                .style("font-style", titleFmt.titleItalic.value ? "italic" : "normal")
                .style("text-decoration", titleFmt.titleUnderline.value ? "underline" : "none")
                .style("fill", this.isHighContrast ? this.highContrastForeground : adaptiveTitle)
                .text(String(titleFmt.titleText.value))
                .style("display", null);
            this.fitText(this.titleEl.node(), Math.max(0, width - margin.left * 2));
        } else {
            this.titleEl.style("display", "none");
        }

        // Legend height — degraded (hidden) before the title as the tile
        // shrinks (§7: callouts -> labels/legend -> title).
        const showLegendResolved = s.showLegend.value && !degradeLabels;

        // Shared flat category-label colour for the legend + axis titles
        // (D-16 sweep: the untouched dark-navy default is invisible on dark
        // surfaces, so swap to the light text token there).
        const catFlatColor = s.categoryColor.value.value === "#130064"
            ? this.adaptiveInk() : s.categoryColor.value.value;

        let yOffset = margin.top;

        // ─── Legend (board v2: TOP of the card, above the rows) ─────────
        // Previously appended at the BOTTOM without advancing yOffset — and
        // since the SVG is sized to the returned content height, the legend
        // was drawn past the viewport's bottom edge and clipped away
        // entirely (invisible). Rendering it up here reserves its height so
        // the rows flow beneath it, matching the design board's placement.
        if (showLegendResolved) {
            const usedSegments = new Set<number>();
            data.rows.forEach(row => row.segments.forEach(seg => usedSegments.add(seg.roleIndex)));

            const legendG = this.container.append("g");

            let lx = 0;
            let ly = 0;
            let legendW = 0;
            usedSegments.forEach((idx) => {
                const cfg = segmentConfigs[idx];
                if (!cfg) return;
                const itemWidth = Math.min(rowWidth, 14 + measure(cfg.label, 10, "Segoe UI, sans-serif", "400"));
                if (lx > 0 && lx + itemWidth > rowWidth) {
                    lx = 0;
                    ly += 18;
                }

                legendG.append("rect")
                    .attr("x", lx).attr("y", ly)
                    .attr("width", 10).attr("height", 10).attr("rx", 2)
                    .attr("fill", cfg.color).attr("opacity", opacity);

                const label = legendG.append("text")
                    .attr("x", lx + 14).attr("y", ly + 5).attr("dy", "0.35em")
                    .attr("font-size", "10px").attr("font-family", "Segoe UI, sans-serif")
                    .attr("fill", this.isHighContrast ? this.highContrastForeground : catFlatColor)
                    .text(cfg.label);
                this.fitText(label.node(), Math.max(0, rowWidth - lx - 14));

                const bbox = (label.node() as SVGTextElement).getBBox();
                lx += 14 + bbox.width + 16;
                legendW = Math.max(legendW, lx - 16);
            });

            // Legend alignment (legendAlign): left (default) | centre | right
            // — measure the built run (lx minus the trailing gap) and shift the
            // whole group. Mirrors the title's alignment convention.
            const legAlign = textAlignFor(String((s as any).legendAlign?.value || "left"));
            const legX = legAlign === "center" ? (width - legendW) / 2
                : legAlign === "right" ? (width - margin.left - legendW)
                : margin.left;
            legendG.attr("transform", `translate(${Math.max(margin.left, legX)}, ${yOffset})`);
            yOffset += ly + 24;
        }

        // Rows
        data.rows.forEach((row: TimeBreakdownRow, rowIndex: number) => {
            const identity = this.rowSelectionIds[row.categoryIndex];
            const rowG = this.container.append("g")
                .attr("data-key", identity?.getKey() ?? "")
                .attr("role", "option").attr("tabindex", this.host.allowInteractions === false ? -1 : 0)
                .attr("transform", `translate(${margin.left}, ${yOffset})`);

            // Per-row Total Colour resolution (TRANS-04 fx): reads the
            // rule-evaluated fill (if a rule is set) via the official
            // ColorHelper.getColorForMeasure path against this row's own
            // per-instance object overrides, falling back to the static
            // format-pane value otherwise.
            const instanceObjects = this.categoricalCategories?.objects?.[row.categoryIndex];
            let resolvedTotalColor = this.totalColorHelper?.getColorForMeasure(instanceObjects, "totalColor") ?? totalColorDefault;
            // D-16 adaptive: the untouched dark-navy default swaps to the light
            // text token on dark surfaces (total value was invisible on dark —
            // Neil sweep pattern); user-set / fx honoured.
            if (resolvedTotalColor === "#130064") resolvedTotalColor = this.adaptiveInk();
            const totalColor = this.isHighContrast ? this.highContrastForeground : resolvedTotalColor;

            // Per-row Category Label Colour resolution (TEXT-02 fx): same
            // pattern as Total Colour above.
            let resolvedCategoryColor = this.categoryColorHelper?.getColorForMeasure(instanceObjects, "categoryColor") ?? s.categoryColor.value.value;
            if (resolvedCategoryColor === "#130064") resolvedCategoryColor = this.adaptiveInk();
            const catColor = this.isHighContrast ? this.highContrastForeground : resolvedCategoryColor;

            // Category label
            const categoryEl = rowG.append("text")
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
            this.fitText(categoryEl.node(), rowWidth);

            const categoryH = Math.max(catFontSize + 4, categoryEl.node().getBBox().height + 2);
            const bodyH = Math.max(barHeight, !totalsBelow && s.showTotalLabel.value ? totalFontSize * 1.2 : 0);
            const barY = categoryH + (bodyH - barHeight) / 2;
            const totalY = totalsBelow ? categoryH + bodyH + 6 + totalFontSize / 2 : categoryH + bodyH / 2;
            const rowH = categoryH + bodyH + (totalsBelow && s.showTotalLabel.value ? 8 + totalFontSize * 1.2 : 0);
            let xPos = 0;

            // Segments — categorical ramp fill (segmentConfigs above),
            // rendered as a rounded-corner PATH (not a plain <rect>) so
            // the LED-gap rhythm can carry a BIGGER radius only on the
            // true outer ends of the whole run (this row's first
            // segment's left corners, last segment's right corners) and
            // a smaller LED radius on every inner-adjacent edge (§5).
            row.segments.forEach((seg, segIdx) => {
                const segW = (seg.value / maxTotal) * trackWidth;
                const baseConfig = segmentConfigs[seg.roleIndex] || segmentConfigs[0];
                const cfg = {
                    ...baseConfig,
                    color: this.isHighContrast ? this.highContrastForeground
                        : deadTimeIndex === seg.roleIndex ? deadTimeGrey
                        : this.segmentColorHelpers[seg.roleIndex]?.getColorForMeasure(instanceObjects, `segment${seg.roleIndex + 1}Color`) ?? baseConfig.color,
                };
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
                    .attr("d", roundedRectPath(xPos, barY, renderedW, barHeight, rLeft, rRight, rRight, rLeft))
                    .attr("fill", cfg.color)
                    .attr("opacity", opacity);

                // Segment label + value text — suppressed first in the
                // degradation ladder (§7) even when the tile has room for
                // an individual segment's own segW > 30 threshold.
                const showLabel = s.showSegmentLabels.value && !degradeCallouts;
                const showValue = s.showSegmentValues.value && !degradeCallouts;
                if ((showLabel || showValue) && renderedW > 0) {
                    const parts: string[] = [];
                    if (showLabel) parts.push(cfg.label);
                    if (showValue) parts.push(`${this.formatDuration(seg.value, seg.format)}${unit}`);
                    const labelText = parts.join(" ");
                    const callout = rowG.append("text")
                        .attr("x", xPos + renderedW / 2)
                        .attr("y", barY + barHeight / 2)
                        .attr("dy", "0.35em")
                        .attr("text-anchor", "middle")
                        .attr("font-size", `${valFontSize}px`)
                        .attr("font-family", valFontFamily)
                        .style("font-weight", valWeight)
                        .style("font-style", valStyle)
                        .style("text-decoration", valDecoration)
                        .style("font-feature-settings", TABULAR_NUMS)
                        .attr("fill", this.contrastText(compositeOver(cfg.color, 100 - opacity * 100, this.surfaceHex)))
                        .text(labelText);
                    if (callout.node().getBBox().width + 8 > renderedW && showLabel && showValue) {
                        callout.text(`${this.formatDuration(seg.value, seg.format)}${unit}`);
                    }
                    const box = callout.node().getBBox();
                    if (box.width + 8 > renderedW || box.height + 2 > barHeight) callout.remove();
                }

                xPos += segW;
            });

            // Total label at end — settles via the shared motion helper
            // (§6) once per category when its displayed text changes,
            // capped at MOTION_MAX_MS and skipped under
            // prefers-reduced-motion internally.
            if (s.showTotalLabel.value) {
                // §3/§4: an explicit total wins; otherwise the row's own derived
                // total, which is null when the row has no assertable duration
                // (all blank, no measures bound, or a rejected negative reading)
                // — that renders the no-value dash, never "0 min".
                const totalVal = row.total ?? row.derivedTotal;
                const hasTotal = totalVal !== null && Number.isFinite(totalVal);
                const totalText = totalTextFor(row);
                const totalX = totalsBelow ? 0 : xPos + 8;
                const totalEl = rowG.append("text")
                    .attr("x", totalX)
                    .attr("y", totalY)
                    .attr("dy", "0.35em")
                    .attr("font-size", `${totalFontSize}px`)
                    .attr("font-family", totalFontFamily)
                    .style("font-weight", totalWeight)
                    .style("font-style", totalStyle)
                    .style("text-decoration", totalDecoration)
                    .style("font-feature-settings", TABULAR_NUMS)
                    .attr("fill", totalColor)
                    .text(totalText);
                this.fitText(totalEl.node(), Math.max(0, rowWidth - totalX));

                const animationKey = identity?.getKey() ?? row.category;
                if (this.lastTotalByCategory.get(animationKey) !== totalText) {
                    settle(totalEl.node() as unknown as SVGElement, [
                        { opacity: 0.35, transform: "translateY(2px)" },
                        { opacity: 1, transform: "translateY(0)" },
                    ], { duration: Math.min(200, MOTION_MAX_MS) });
                    this.lastTotalByCategory.set(animationKey, totalText);
                }

                // Δ delta chip (board Total · Δ): pill after the total showing
                // % vs the first row (baseline). rect appended before text so
                // it sits under it; both sized after measuring the label.
                // §3: a row with no total of its own is not a baseline and has
                // no percentage to report — it gets no chip rather than a
                // fabricated "baseline"/"0%" against a value that was never read.
                if (showDelta && hasTotal) {
                    const totalW = (totalEl.node() as SVGTextElement).getBBox().width;
                    const chipX = totalX + totalW + 6;
                    const chipH = 16, chipPadX = 6;
                    let chipStr: string, chipInk: string, chipFill: string;
                    const delta = hasBaseline ? (totalVal - baselineTotal) / baselineTotal * 100 : null;
                    if (rowIndex === 0 || delta === null || Math.round(delta) === 0) {
                        chipStr = rowIndex === 0 ? "baseline" : delta === null ? "N/A" : "0%";
                        const grey = mutedInk(this.adaptiveInk(), this.surfaceHex);
                        chipInk = this.isHighContrast ? this.highContrastForeground : grey;
                        chipFill = this.isHighContrast ? "none" : toRgba(grey, 86);
                    } else {
                        chipStr = (delta <= 0 ? "−" : "+") + Math.abs(delta).toFixed(0) + "%";
                        const band = bandColor(delta <= 0 ? "success" : "danger", theme);
                        chipInk = this.isHighContrast ? this.highContrastForeground : band;
                        chipFill = this.isHighContrast ? "none" : toRgba(band, 85);
                    }
                    if (!this.isHighContrast) {
                        const chipSurface = compositeOver(chipInk, chipStr === "baseline" || chipStr === "N/A" || chipStr === "0%" ? 86 : 85, this.surfaceHex);
                        if (contrastRatio(chipInk, chipSurface) < 4.5) {
                            chipInk = contrastInk(chipSurface, "#000000", "#ffffff");
                        }
                    }
                    const chipRect = rowG.append("rect")
                        .attr("rx", chipH / 2).attr("ry", chipH / 2).attr("fill", chipFill)
                        .attr("stroke", this.isHighContrast ? this.highContrastForeground : "none")
                        .attr("stroke-width", this.isHighContrast ? 1 : 0);
                    const chipTextEl = rowG.append("text")
                        .attr("y", totalY).attr("dy", "0.35em")
                        .attr("font-size", "11px").style("font-weight", "700")
                        .attr("font-family", "Segoe UI, sans-serif")
                        .style("font-feature-settings", TABULAR_NUMS)
                        .attr("fill", chipInk).text(chipStr);
                    const chipTextW = (chipTextEl.node() as SVGTextElement).getBBox().width;
                    chipTextEl.attr("x", chipX + chipPadX);
                    chipRect.attr("x", chipX).attr("y", totalY - chipH / 2)
                        .attr("width", chipTextW + chipPadX * 2).attr("height", chipH);
                }
            }

            // Invisible hit rect for tooltip and cross-filtering
            const hitRect = rowG.append("rect")
                .attr("class", "time-breakdown-hit")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", rowWidth)
                .attr("height", rowH)
                .attr("fill", "transparent")
                .style("cursor", this.host.allowInteractions === false ? "default" : "pointer");

            const tooltipItems: VisualTooltipDataItem[] = [
                { displayName: "Category", value: row.category }
            ];
            row.readings.forEach((seg) => {
                const cfg = segmentConfigs[seg.roleIndex] || segmentConfigs[0];
                tooltipItems.push({
                    displayName: cfg.label,
                    value: `${this.formatDuration(seg.value, seg.format)}${unit}`
                });
            });
            // Same total contract as the rendered label above (§3/§4): the
            // tooltip must not repeat a rounding the label no longer does, nor
            // report a total the row never had.
            const tooltipTotal = row.total ?? row.derivedTotal;
            tooltipItems.push({
                displayName: "Total",
                value: tooltipTotal !== null && Number.isFinite(tooltipTotal)
                    ? `${this.formatDuration(tooltipTotal, data.totalFormat)}${unit}`
                    : NO_VALUE
            });
            if (row.totalMismatch) {
                tooltipItems.push({
                    displayName: "Data quality",
                    value: `Total ${this.formatDuration(row.total, data.totalFormat)}${unit} differs from segment sum ${this.formatDuration(row.derivedTotal, data.totalFormat)}${unit}.`,
                });
            }
            if (row.invalidDuration) {
                tooltipItems.push({
                    displayName: "Data quality",
                    value: "Negative duration: the stack is not drawn and no segment total is derived.",
                });
            }

            rowG.attr("aria-label", tooltipItems.map(item => `${item.displayName}: ${item.value}`).join(", "));
            const selectRow = (e: MouseEvent | KeyboardEvent): void => {
                if (this.host.allowInteractions !== false && identity) {
                    this.selectionManager.select(identity, e.ctrlKey || e.metaKey).then(() => this.applySelection());
                }
                e.stopPropagation();
            };
            hitRect.on("mousemove.timeBreakdown", (e: MouseEvent) => {
                this.tooltipService.show({
                    coordinates: [e.clientX, e.clientY],
                    isTouchEvent: false,
                    dataItems: tooltipItems,
                    identities: identity ? [identity] : []
                });
            });
            hitRect.on("mouseleave.timeBreakdown", () => {
                this.tooltipService.hide({ isTouchEvent: false, immediately: false });
            });
            hitRect.on("click.timeBreakdown", selectRow);
            rowG.on("contextmenu.timeBreakdown", (e: MouseEvent) => {
                if (this.host.allowInteractions !== false && identity) {
                    this.selectionManager.showContextMenu(identity, { x: e.clientX, y: e.clientY });
                }
                e.preventDefault();
                e.stopPropagation();
            }).on("keydown.timeBreakdown", (e: KeyboardEvent) => {
                if (this.host.allowInteractions === false) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectRow(e);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    this.selectionManager.clear().then(() => this.applySelection());
                } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                    e.preventDefault();
                    const box = rowG.node().getBoundingClientRect();
                    this.selectionManager.showContextMenu(identity, { x: box.x, y: box.y });
                }
            }).on("focus.timeBreakdown", () => {
                rowG.style("outline", `2px solid ${this.isHighContrast ? this.highContrastForeground : this.adaptiveInk()}`);
            }).on("blur.timeBreakdown", () => {
                rowG.style("outline", null);
            });

            yOffset += rowH + Math.max(4, rowSpacing);
        });

        // Numeric x-axis tick VALUES on the shared scale (board: 0 · 3 · 6 …).
        // Missing before this pass — the design's key "shared hours scale" cue.
        // Degrades with the labels; nice-rounded step from the data's max total.
        if (!degradeLabels && maxTotal > 0) {
            const rawStep = maxTotal / 6;
            const mag = Math.pow(10, Math.floor(Math.log10(rawStep) || 0));
            const norm = rawStep / mag;
            const niceStep = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
            // §4: decimals the STEP needs. Rounding every tick to a whole number
            // turned a 0.1-minute step into "0,0,0,0,0,1,1" — seven labels, two
            // distinct values, none of them the position they marked.
            const tickDecimals = Math.max(0, Math.ceil(-Math.log10(niceStep)));
            const tickColor = this.isHighContrast ? this.highContrastForeground : mutedInk(this.adaptiveInk(), this.surfaceHex);
            const tickY = yOffset + 12;
            let previousRight = -Infinity;
            for (let i = 0; i <= 12 && niceStep > 0 && Number.isFinite(niceStep); i++) {
                const v = i * niceStep;
                if (v > maxTotal + niceStep * 0.001) break;
                const tick = this.container.append("text")
                    .attr("x", margin.left + (v / maxTotal) * trackWidth)
                    .attr("y", tickY)
                    .attr("text-anchor", i === 0 ? "start" : "middle")
                    .attr("font-size", "10px")
                    .attr("font-family", "Segoe UI, sans-serif")
                    .attr("fill", tickColor)
                    .text(this.formatTick(v, tickDecimals, data.totalFormat));
                const box = tick.node().getBBox();
                if (box.x < previousRight + 6 || box.x + box.width > width) tick.remove();
                else previousRight = box.x + box.width;
            }
            yOffset += 20;
        }

        // Axis titles (X = time values, Y = categories) — degraded
        // (hidden) before the title as the tile shrinks (§7). catFlatColor
        // (the D-16-adapted flat category colour, shared with the legend) is
        // computed once near the top of render().
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
            const titleColor = this.isHighContrast ? this.highContrastForeground : catFlatColor;
            if (xAxisTitle) {
                // Clear gap below the tick numbers. (The legacy
                // `showLegendResolved ? 0 : 8` offset assumed the legend sat
                // here; it's now at the top, which left the title snug on the
                // ticks.)
                const xTitleY = yOffset + 12 + axisTitleFontSize;
                const xTitle = this.container.append("text")
                    .classed("axis-title x-axis-title", true)
                    .attr("x", margin.left + trackWidth / 2)
                    .attr("y", xTitleY)
                    .attr("text-anchor", "middle")
                    .attr("font-size", axisTitleFontSize + "px")
                    .attr("font-weight", "600")
                    .attr("fill", titleColor)
                    .attr("font-family", "Segoe UI, sans-serif")
                    .text(xAxisTitle);
                this.fitText(xTitle.node(), trackWidth);
                yOffset = xTitleY + 6;
            }
            if (yAxisTitle) {
                const chartMidY = margin.top + (yOffset - margin.top) / 2;
                const yTitle = this.container.append("text")
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
                this.fitText(yTitle.node(), Math.max(0, yOffset - margin.top - 12));
            }
        }

        return yOffset;
    }

    /** Model formatting and the author's manual time-unit suffix stay separate. */
    private formatDuration(value: number, format: string | null | undefined): string {
        if (!Number.isFinite(value)) return NO_VALUE;
        return formatModelNumber(value, format, this.host?.locale || undefined);
    }

    private fitText(node: SVGTextElement, width: number): void {
        const full = node.textContent ?? "";
        if (node.getBBox().width <= width) return;
        const chars = Array.from(full);
        let low = 0, high = chars.length;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            node.textContent = chars.slice(0, mid).join("") + "…";
            if (node.getBBox().width <= width) low = mid;
            else high = mid - 1;
        }
        node.textContent = low ? chars.slice(0, low).join("") + "…" : "";
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = full;
        node.appendChild(title);
    }

    /** Axis tick label — fixed decimals derived from the tick STEP, not the
     *  model format, so a 0.1-minute step reads 0.0 · 0.1 · 0.2 … instead of the
     *  seven rounded, repeated "0,0,0,0,0,1,1" labels (NEXUS cycle-13 §4). */
    private formatTick(value: number, decimals: number, format: string | null): string {
        const precision = Math.max(fractionDigitsFor(format).min, decimals - (format?.includes("%") ? 2 : 0), 0);
        if (precision > 20) return value.toExponential(2);
        if (format) {
            const tickFormat = format.replace(/([#0][,#0]*)(?:\.[0#]+)?/, "$1" + (precision ? "." + "0".repeat(precision) : ""));
            return formatModelNumber(value, tickFormat, this.host?.locale || undefined);
        }
        return value.toLocaleString(this.host?.locale || undefined, {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision,
        });
    }

    private contrastText(bgHex: string): string {
        if (this.isHighContrast) return this.highContrastBackground;
        return contrastInk(bgHex, "#000000", "#ffffff");
    }

    private adaptiveInk(darkInk = "#130064"): string {
        const ink = contrastInk(this.surfaceHex, darkInk, surfaceTokens("dark").text);
        return contrastRatio(ink, this.surfaceHex) >= 4.5
            ? ink : contrastInk(this.surfaceHex, "#000000", "#ffffff");
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        // Drop the in-flight licence check FIRST: its redraw callback replays
        // update() against a torn-down target otherwise (NEXUS lifecycle finding).
        this.licenseGate.dispose();
        this.lastUpdateOptions = null;
        d3.select(this.target).on(".timeBreakdown", null);
        this.selectionManager.registerOnSelectCallback(() => {});
        this.cornerSignature?.destroy();
        this.cornerSignature = null;
        this.container?.selectAll("*").on(".timeBreakdown", null).remove();
        this.svg?.remove();
        this.scrollContainer?.remove();
        this.lastTotalByCategory.clear();
        this.rowSelectionIds = [];
        this.categoricalCategories = undefined;
        this.categoryColorHelper = this.totalColorHelper = null;
        this.segmentColorHelpers = [];
        this.container = null;
        this.svg = null;
        this.scrollContainer = null;
        this.backgroundRect = this.borderRect = null;
        this.titleEl = null;
    }
}
