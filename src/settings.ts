import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

import { BackgroundSettings } from "../../_shared/formatting/backgroundSettings";
import { TitleSettings } from "../../_shared/formatting/titleSettings";
import { alignSlice, alignSelfFor, textAlignFor, makeFontControl } from "../../_shared/formatting/textFormatting";

const ConstantOrRule = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

// TitleSettings + text-formatting helpers now live in _shared/formatting/
// (D-13, D-14). Re-exported so visual.ts can import them from "./settings"
// (stable import path).
export { TitleSettings, alignSlice, alignSelfFor, textAlignFor };

export class TimeBreakdownSettings extends FormattingSettingsCard {
    name = "timeBreakdownStyle";
    displayName = "Time Breakdown";

    barHeight = new formattingSettings.NumUpDown({
        name: "barHeight",
        displayName: "Bar height",
        value: 20,
    });

    barRadius = new formattingSettings.NumUpDown({
        name: "barRadius",
        displayName: "Bar radius",
        value: 4,
    });

    rowSpacing = new formattingSettings.NumUpDown({
        name: "rowSpacing",
        displayName: "Row spacing",
        value: 32,
    });

    // v2 board defaults (D-16): the frozen v3 engine's own categorical
    // ramp (spectrumRamp(index, 3), dark theme) — cyan / violet / magenta —
    // so a brand-new report lands on the board's "brand ramp" language;
    // any report that already set a segment ColorPicker keeps its own
    // saved value untouched.
    segment1Color = new formattingSettings.ColorPicker({
        name: "segment1Color",
        displayName: "Segment 1 colour",
        value: { value: "#00d9ff" },
        instanceKind: ConstantOrRule
    });

    segment1Label = new formattingSettings.TextInput({
        name: "segment1Label",
        displayName: "Segment 1 label",
        value: "Dispatch",
        placeholder: "Segment 1",
    });

    segment2Color = new formattingSettings.ColorPicker({
        name: "segment2Color",
        displayName: "Segment 2 colour",
        value: { value: "#b9a7ff" },
        instanceKind: ConstantOrRule
    });

    segment2Label = new formattingSettings.TextInput({
        name: "segment2Label",
        displayName: "Segment 2 label",
        value: "Travel",
        placeholder: "Segment 2",
    });

    segment3Color = new formattingSettings.ColorPicker({
        name: "segment3Color",
        displayName: "Segment 3 colour",
        value: { value: "#ff3b52" },
        instanceKind: ConstantOrRule
    });

    segment3Label = new formattingSettings.TextInput({
        name: "segment3Label",
        displayName: "Segment 3 label",
        value: "At scene",
        placeholder: "Segment 3",
    });

    totalColor = new formattingSettings.ColorPicker({
        name: "totalColor",
        displayName: "Total colour",
        value: { value: "#130064" },
        instanceKind: ConstantOrRule
    });

    // v2 board addition (LOOK-03, genuinely optional — default "None"
    // preserves pre-plan behaviour exactly, D-16): marks ONE of the three
    // fixed segment roles as dead/idle time so it renders grey instead of
    // its categorical-ramp colour ("Wait is deliberately grey — dead time
    // shouldn't get a hero colour"). This visual's schema is 3 fixed
    // segment measures (not variable categories), so a dropdown selecting
    // which segment is dead time is the additive, non-schema-breaking
    // equivalent of the design board's dedicated "Wait" category.
    deadTimeSegment = new formattingSettings.ItemDropdown({
        name: "deadTimeSegment",
        displayName: "Dead Time Segment",
        description: "Render one segment as dead/idle time (grey, no hero colour). Leave as None to keep every segment on the categorical ramp.",
        items: [
            { displayName: "None", value: "none" },
            { displayName: "Segment 1", value: "segment1" },
            { displayName: "Segment 2", value: "segment2" },
            { displayName: "Segment 3", value: "segment3" }
        ],
        value: { displayName: "None", value: "none" }
    });

    showSegmentLabels = new formattingSettings.ToggleSwitch({
        name: "showSegmentLabels",
        displayName: "Show segment labels",
        value: true,
    });

    showSegmentValues = new formattingSettings.ToggleSwitch({
        name: "showSegmentValues",
        displayName: "Show segment values",
        value: true,
    });

    showTotalLabel = new formattingSettings.ToggleSwitch({
        name: "showTotalLabel",
        displayName: "Show total label",
        value: true,
    });

    valueUnit = new formattingSettings.TextInput({
        name: "valueUnit",
        displayName: "Value unit",
        value: "min",
        placeholder: "min",
    });

    showLegend = new formattingSettings.ToggleSwitch({
        name: "showLegend",
        displayName: "Show legend",
        value: true,
    });

    // Category label text — FontControl composite reuses the existing
    // "categoryFontSize" property name (D-06/D-07: additive-only, no schema
    // rename) alongside NEW sibling properties (family/bold/italic/
    // underline). Bold defaults false; the off-state renders this surface's
    // own pre-existing hardcoded font-weight:600 (see weightFor idiom in
    // visual.ts), not a flat 400 — render-nothing-default parity (D-06).
    private categoryFontBundle = makeFontControl("category", { fontSize: 12, bold: false });
    categoryFontFamily = this.categoryFontBundle.fontFamily;
    categoryFontSize = this.categoryFontBundle.fontSize;
    categoryBold = this.categoryFontBundle.bold;
    categoryItalic = this.categoryFontBundle.italic;
    categoryUnderline = this.categoryFontBundle.underline;
    categoryFont = this.categoryFontBundle.control;

    // Segment label/value text — reuses "valueFontSize"; bold defaults
    // false (off-state renders the pre-existing hardcoded font-weight:500).
    private valueFontBundle = makeFontControl("value", { fontSize: 11, bold: false });
    valueFontFamily = this.valueFontBundle.fontFamily;
    valueFontSize = this.valueFontBundle.fontSize;
    valueBold = this.valueFontBundle.bold;
    valueItalic = this.valueFontBundle.italic;
    valueUnderline = this.valueFontBundle.underline;
    valueFont = this.valueFontBundle.control;

    segmentOpacity = new formattingSettings.NumUpDown({
        name: "segmentOpacity",
        displayName: "Segment opacity (0-100)",
        value: 75,
    });

    categoryColor = new formattingSettings.ColorPicker({
        name: "categoryColor",
        displayName: "Category label colour",
        value: { value: "#130064" },
        instanceKind: ConstantOrRule
    });

    // Total/summary label text — brand-new dedicated font composite (this
    // surface had no independent size/family/style controls before; it
    // rendered at categoryFontSize with a hardcoded font-weight:700 and
    // totalColor). Bold defaults TRUE to preserve that exact prior weight
    // at the new property's default (off would otherwise regress to 400).
    private totalFontBundle = makeFontControl("total", { fontSize: 12, bold: true });
    totalFontFamily = this.totalFontBundle.fontFamily;
    totalFontSize = this.totalFontBundle.fontSize;
    totalBold = this.totalFontBundle.bold;
    totalItalic = this.totalFontBundle.italic;
    totalUnderline = this.totalFontBundle.underline;
    totalFont = this.totalFontBundle.control;

    slices: FormattingSettingsSlice[] = [
        this.barHeight,
        this.barRadius,
        this.rowSpacing,
        this.segment1Color,
        this.segment1Label,
        this.segment2Color,
        this.segment2Label,
        this.segment3Color,
        this.segment3Label,
        this.totalColor,
        this.deadTimeSegment,
        this.showSegmentLabels,
        this.showSegmentValues,
        this.showTotalLabel,
        this.valueUnit,
        this.showLegend,
        this.categoryFont,
        this.categoryColor,
        this.valueFont,
        this.totalFont,
        this.segmentOpacity,
    ];
}

export class AxisSettingsCard extends formattingSettings.SimpleCard {
    showAxisTitles = new formattingSettings.ToggleSwitch({
        name: "showAxisTitles",
        displayName: "Show Axis Titles",
        description: "Display titles below X axis (time values) and beside Y axis (categories)",
        value: false
    });

    xAxisTitle = new formattingSettings.TextInput({
        name: "xAxisTitle",
        displayName: "X Axis Title",
        placeholder: "X axis title",
        value: ""
    });

    yAxisTitle = new formattingSettings.TextInput({
        name: "yAxisTitle",
        displayName: "Y Axis Title",
        placeholder: "Y axis title",
        value: ""
    });

    name: string = "axisSettings";
    displayName: string = "Axis Titles";
    slices: FormattingSettingsSlice[] = [
        this.showAxisTitles,
        this.xAxisTitle,
        this.yAxisTitle
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    titleSettings = new TitleSettings();
    timeBreakdownCard = new TimeBreakdownSettings();
    axisSettingsCard = new AxisSettingsCard();
    background = new BackgroundSettings();

    constructor() {
        super();
        // D-06 default-preservation override (per-visual instance only —
        // _shared/formatting/backgroundSettings.ts itself is untouched,
        // D-11): pbiTimeBreakdown's PRE-EXISTING default was "no background
        // painted" — neither the scroll container, the SVG, nor the
        // content <g> ever had a background-color set (confirmed against
        // style/visual.less and the pre-plan render() path). The frozen
        // shared Background card's own default (opaque white, transparency
        // 0) would regress every old saved report that never touched this
        // brand-new property to a suddenly-opaque white background.
        // Overriding the TRANSPARENCY default to 100 on this instance makes
        // toRgba(...) resolve to alpha 0 regardless of colour — pixel-
        // identical to "nothing painted" — while still exposing a real,
        // working Colour + Transparency control for any report that opts in.
        this.background.transparency.value = 100;
    }

    cards = [this.titleSettings, this.timeBreakdownCard, this.axisSettingsCard, this.background];
}
