# User Guide – Codex Time Breakdown

## Overview
Side-by-side horizontal stacked bar comparison showing time segments for different event outcomes. Each row represents a scenario (e.g., 'Battery Not Available', 'Battery Sold') and shows the breakdown of time into segments (e.g., dispatch, travel, at-scene) with a total.

## 1. Adding the Visual
1. Import the `.pbiviz` file into Power BI Desktop
2. Locate the visual in the Visualizations pane
3. Drag it onto the report canvas

## 2. Data Binding
- **Category** (Required): Scenario label (e.g. 'Battery Not Available', 'Battery Sold'). Each unique value creates a row.
- **Segment 1** (Required): First time segment measure (e.g. Avg Dispatch Time).
- **Segment 2** (Required): Second time segment measure (e.g. Avg Travel Time).
- **Segment 3** (Required): Third time segment measure (e.g. Avg At Scene Time).
- **Total** (Optional): Total time measure — shown as end label. If not bound, the total is calculated as the sum of the three segments.
- **Sort Order** (Optional): Numeric sort order — rows sorted ascending by this value.

## 3. Formatting Options
**Time Breakdown Style**
- Bar Height: Height of each segment bar (px).
- Bar Radius: Corner radius of the segment bars (px).
- Row Spacing: Vertical space between rows (px).
- Segment 1 Color: Colour for the first segment.
- Segment 1 Label: Label for the first segment (e.g., 'Dispatch').
- Segment 2 Color: Colour for the second segment.
- Segment 2 Label: Label for the second segment (e.g., 'Travel').
- Segment 3 Color: Colour for the third segment.
- Segment 3 Label: Label for the third segment (e.g., 'At Scene').
- Total Color: Colour for the total label.
- Show Segment Labels: Toggle display of segment labels inside the bars.
- Show Segment Values: Toggle display of segment values inside the bars.
- Show Total Label: Toggle display of the total label at the end of each bar.
- Value Unit: Unit to display after values (e.g., 'min', 'sec').
- Show Legend: Toggle visibility of the colour legend.
- Category Font Size: Size of the scenario label text.
- Value Font Size: Size of the segment and total values.
- Segment Opacity: Opacity of the segment fills (0-100).
- Category Color: Colour of the scenario label text.

**Axis Settings**
- Show Axis Titles: Toggle visibility of axis titles.
- X Axis Title: Title for the time axis (e.g., 'Time (minutes)').
- Y Axis Title: Title for the scenario axis (typically not used, as categories are on the left).

## 4. Features
- Horizontal stacked bars showing time segments for each scenario.
- Each segment is colour-coded and labelled.
- Total time shown at the end of each bar.
- Tooltips on hover showing scenario, each segment value, and total.
- Click a row to cross-filter other visuals by that scenario (if Category bound).
- Right-click for context menu.
- Supports high contrast mode and keyboard navigation.
- Configurable bar height, radius, spacing, and colours.
- Optional display of segment labels and values inside bars.
- Optional total label.
- Value unit suffix (e.g., 'min').
- Legend showing segment colours and labels.
- Sorting by Sort Order field (ascending).

## 5. Limitations
- Only the first 30,000 rows are processed (data reduction limit).
- Requires Category and at least one Segment to be bound; missing segments are treated as zero.
- Segment measures must be numeric; non-numeric values are treated as zero.
- If Total is bound, it must be numeric; otherwise, the total is the sum of the three segments.
- The visual does not support drill-through or hierarchical categories.
- Sort Order must be numeric; non-numeric values are placed at the end.

## 6. Support
For help or questions, visit https://nexuscodex.nexus/support