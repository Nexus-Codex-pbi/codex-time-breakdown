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
import { VisualFormattingSettingsModel, TimeBreakdownSettings, AxisSettingsCard } from "./settings";
import { parseDataView, TimeBreakdownData, TimeBreakdownRow } from "./dataParser";

import * as d3 from "d3";

export class Visual implements IVisual {
    private host: IVisualHost;
    private target: HTMLElement;
    private scrollContainer: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
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
            .style("overflow", "auto");

        this.svg = this.scrollContainer
            .append("svg")
            .attr("class", "time-breakdown");

        this.container = this.svg.append("g");

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
                this.events.renderingFinished(options);
                return;
            }

            this.formattingSettings = this.formattingSettingsService
                .populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);

            const data = parseDataView(dv);
            if (!data || data.rows.length === 0) {
                this.container.selectAll("*").remove();
                this.rowSelectionIds = [];
                this.events.renderingFinished(options);
                return;
            }

            // Build selection IDs per row
            const categories = dv.categorical?.categories?.[0];
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

            const w = options.viewport.width;
            const h = options.viewport.height;
            // Set viewport size on scroll container; render will compute actual content size
            this.scrollContainer.style("width", w + "px").style("height", h + "px");

            const contentH = this.render(data, w);
            // Size SVG to actual content so scroll container shows scrollbars when needed
            this.svg.attr("width", w).attr("height", contentH);
            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
        }
    }

    private render(data: TimeBreakdownData, width: number): number {
        this.container.selectAll("*").remove();

        const s = this.formattingSettings.timeBreakdownCard;
        const barHeight = s.barHeight.value;
        const barRadius = s.barRadius.value;
        const rowSpacing = s.rowSpacing.value;
        const opacity = this.isHighContrast ? 1 : Math.min(100, Math.max(0, s.segmentOpacity.value)) / 100;
        const unit = s.valueUnit.value || "";
        const catFontSize = s.categoryFontSize.value;
        const valFontSize = s.valueFontSize.value;
        const catColor = this.isHighContrast ? this.highContrastForeground : s.categoryColor.value.value;
        const totalColor = this.isHighContrast ? this.highContrastForeground : s.totalColor.value.value;

        const segmentConfigs = this.isHighContrast
            ? [
                { color: this.highContrastForeground, label: s.segment1Label.value },
                { color: this.highContrastForeground, label: s.segment2Label.value },
                { color: this.highContrastForeground, label: s.segment3Label.value },
            ]
            : [
                { color: s.segment1Color.value.value, label: s.segment1Label.value },
                { color: s.segment2Color.value.value, label: s.segment2Label.value },
                { color: s.segment3Color.value.value, label: s.segment3Label.value },
            ];

        // Layout
        const margin = { top: 8, right: 60, bottom: 30, left: 12 };
        const trackWidth = width - margin.left - margin.right;
        const maxTotal = data.maxTotal || 1;

        // Legend height
        const legendH = s.showLegend.value ? 24 : 0;

        let yOffset = margin.top;

        // Rows
        data.rows.forEach((row: TimeBreakdownRow) => {
            const rowG = this.container.append("g")
                .attr("transform", `translate(${margin.left}, ${yOffset})`);

            // Category label
            rowG.append("text")
                .attr("x", 0)
                .attr("y", 0)
                .attr("dy", "0.9em")
                .attr("font-size", `${catFontSize}px`)
                .attr("font-family", "Segoe UI, sans-serif")
                .attr("font-weight", "600")
                .attr("fill", catColor)
                .text(row.category);

            const barY = catFontSize + 4;
            let xPos = 0;

            // Segments
            row.segments.forEach((seg) => {
                const segW = (seg.value / maxTotal) * trackWidth;
                const cfg = segmentConfigs[seg.roleIndex] || segmentConfigs[0];

                // Segment rect
                rowG.append("rect")
                    .attr("x", xPos)
                    .attr("y", barY)
                    .attr("width", Math.max(0, segW))
                    .attr("height", barHeight)
                    .attr("rx", barRadius)
                    .attr("ry", barRadius)
                    .attr("fill", cfg.color)
                    .attr("opacity", opacity);

                // Segment label + value text
                const showLabel = s.showSegmentLabels.value;
                const showValue = s.showSegmentValues.value;
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
                        .attr("font-family", "Segoe UI, sans-serif")
                        .attr("font-weight", "500")
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
                        .attr("font-family", "Segoe UI, sans-serif")
                        .attr("fill", cfg.color)
                        .text(labelText);
                }

                xPos += segW;
            });

            // Total label at end
            if (s.showTotalLabel.value) {
                const totalVal = row.total ?? row.segments.reduce((sum, seg) => sum + seg.value, 0);
                rowG.append("text")
                    .attr("x", xPos + 8)
                    .attr("y", barY + barHeight / 2)
                    .attr("dy", "0.35em")
                    .attr("font-size", `${catFontSize}px`)
                    .attr("font-family", "Segoe UI, sans-serif")
                    .attr("font-weight", "700")
                    .attr("fill", totalColor)
                    .text(`${Math.round(totalVal)} ${unit}`);
            }

            // Invisible hit rect for tooltip and cross-filtering
            const hitRect = rowG.append("rect")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", trackWidth + 60)
                .attr("height", catFontSize + 4 + barHeight)
                .attr("fill", "transparent")
                .style("cursor", "pointer");

            const rowIndex = data.rows.indexOf(row);
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

        // Axis titles (X = time values, Y = categories)
        const axisS = this.formattingSettings.axisSettingsCard;
        const showAxisTitles = axisS.showAxisTitles.value;
        const xAxisTitle = axisS.xAxisTitle.value || "";
        const yAxisTitle = axisS.yAxisTitle.value || "";
        if (showAxisTitles) {
            const axisTitleFontSize = catFontSize;
            const titleColor = this.isHighContrast ? this.highContrastForeground : catColor;
            if (xAxisTitle) {
                this.container.append("text")
                    .classed("axis-title x-axis-title", true)
                    .attr("x", margin.left + trackWidth / 2)
                    .attr("y", yOffset + (s.showLegend.value ? 0 : 8))
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
        if (s.showLegend.value) {
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

                const label = legendG.append("text")
                    .attr("x", lx + 14)
                    .attr("y", 5)
                    .attr("dy", "0.35em")
                    .attr("font-size", "10px")
                    .attr("font-family", "Segoe UI, sans-serif")
                    .attr("fill", catColor)
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
        this.container?.selectAll("*").remove();
        this.svg?.remove();
        this.container = null;
        this.svg = null;
    }
}
