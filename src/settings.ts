import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

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

    segment1Color = new formattingSettings.ColorPicker({
        name: "segment1Color",
        displayName: "Segment 1 colour",
        value: { value: "#e60e22" },
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
        value: { value: "#d4920a" },
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
        value: { value: "#73afd5" },
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
    });

    showSegmentLabels = new formattingSettings.ToggleSwitch({
        name: "showSegmentLabels",
        displayName: "Show segment labels",
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

    categoryFontSize = new formattingSettings.NumUpDown({
        name: "categoryFontSize",
        displayName: "Category font size",
        value: 12,
    });

    valueFontSize = new formattingSettings.NumUpDown({
        name: "valueFontSize",
        displayName: "Value font size",
        value: 11,
    });

    segmentOpacity = new formattingSettings.NumUpDown({
        name: "segmentOpacity",
        displayName: "Segment opacity (0-100)",
        value: 75,
    });

    categoryColor = new formattingSettings.ColorPicker({
        name: "categoryColor",
        displayName: "Category label colour",
        value: { value: "#130064" },
    });

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
        this.showSegmentLabels,
        this.showTotalLabel,
        this.valueUnit,
        this.showLegend,
        this.categoryFontSize,
        this.valueFontSize,
        this.segmentOpacity,
        this.categoryColor,
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    timeBreakdownCard = new TimeBreakdownSettings();
    cards = [this.timeBreakdownCard];
}
