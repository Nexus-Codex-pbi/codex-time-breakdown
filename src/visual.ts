"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;

import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel, TimeBreakdownSettings } from "./settings";
import { parseDataView, TimeBreakdownData, TimeBreakdownRow } from "./dataParser";

import * as d3 from "d3";

export class Visual implements IVisual {
    private host: IVisualHost;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.formattingSettingsService = new FormattingSettingsService();

        this.svg = d3.select(options.element)
            .append("svg")
            .attr("class", "time-breakdown");

        this.container = this.svg.append("g");
    }

    public update(options: VisualUpdateOptions): void {
        const dv: DataView = options.dataViews?.[0];
        if (!dv) {
            this.container.selectAll("*").remove();
            return;
        }

        this.formattingSettings = this.formattingSettingsService
            .populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);

        const data = parseDataView(dv);
        if (!data || data.rows.length === 0) {
            this.container.selectAll("*").remove();
            return;
        }

        const w = options.viewport.width;
        const h = options.viewport.height;
        this.svg.attr("width", w).attr("height", h);

        this.render(data, w, h);
    }

    private render(data: TimeBreakdownData, width: number, height: number): void {
        this.container.selectAll("*").remove();

        const s = this.formattingSettings.timeBreakdownCard;
        const barHeight = s.barHeight.value;
        const barRadius = s.barRadius.value;
        const rowSpacing = s.rowSpacing.value;
        const opacity = Math.min(100, Math.max(0, s.segmentOpacity.value)) / 100;
        const unit = s.valueUnit.value || "";
        const catFontSize = s.categoryFontSize.value;
        const valFontSize = s.valueFontSize.value;
        const catColor = s.categoryColor.value.value;
        const totalColor = s.totalColor.value.value;

        const segmentConfigs = [
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

                // Segment label
                if (s.showSegmentLabels.value && segW > 30) {
                    const labelText = `${cfg.label} ${Math.round(seg.value)}${unit}`;
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
                } else if (s.showSegmentLabels.value && segW > 0) {
                    // Too narrow — place above
                    rowG.append("text")
                        .attr("x", xPos + segW / 2)
                        .attr("y", barY - 2)
                        .attr("text-anchor", "middle")
                        .attr("font-size", `${valFontSize - 1}px`)
                        .attr("font-family", "Segoe UI, sans-serif")
                        .attr("fill", cfg.color)
                        .text(`${Math.round(seg.value)}${unit}`);
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

            yOffset += catFontSize + 4 + barHeight + rowSpacing;
        });

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
    }

    private contrastText(bgHex: string): string {
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
}
