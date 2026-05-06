# Codex Time Breakdown

## Overview
Side-by-side horizontal stacked bar comparison showing time segments for different event outcomes.

## Features
- Displays horizontal stacked bars for up to three time segments per category
- Shows total time as an end label on each bar
- Optional sorting via a numeric sort order field
- Configurable bar height, radius, and row spacing
- Segment labels and values can be shown inside or above segments
- Legend showing segment colors and labels
- Axis titles for X (time values) and Y (categories)
- Tooltips showing category, segment values, and total
- Click to cross-filter other visuals by category
- Right-click context menu for additional interactions
- High contrast mode support
- Responsive design with scrollbars when content exceeds container size

## Data Roles
| Role | Display Name | Kind | Required? | Data Type | Description |
|------|--------------|------|-----------|-----------|-------------|
| category | Category | Grouping | No (max 1) | Text or Grouping | Scenario label (e.g. 'Battery Not Available', 'Battery Sold') |
| segment1 | Segment 1 | Measure | No (max 1) | Numeric | First time segment measure (e.g. Avg Dispatch Time) |
| segment2 | Segment 2 | Measure | No (max 1) | Numeric | Second time segment measure (e.g. Avg Travel Time) |
| segment3 | Segment 3 | Measure | No (max 1) | Numeric | Third time segment measure (e.g. Avg At Scene Time) |
| totalValue | Total | Measure | No (max 1) | Numeric | Total time measure — shown as end label |
| sortOrder | Sort Order | Measure | No (max 1) | Numeric | Numeric sort order — rows sorted ascending by this value |

Note: Each role can have at most one field bound. At least one segment measure is required for meaningful display.

## Formatting Options
The visual provides the following format pane cards:

### Time Breakdown Style
- Bar Height: Height of each segment bar in pixels
- Bar Radius: Corner radius of segment bars in pixels
- Row Spacing: Vertical space between rows in pixels
- Segment1Color: Fill color for the first segment
- Segment1Label: Label text for the first segment (shown in legend and tooltips)
- Segment2Color: Fill color for the second segment
- Segment2Label: Label text for the second segment
- Segment3Color: Fill color for the third segment
- Segment3Label: Label text for the third segment
- Total Color: Fill color for the total label text
- Show Segment Labels: Toggle visibility of segment labels inside/above segments
- Show Segment Values: Toggle visibility of segment values inside/above segments
- Show Total Label: Toggle visibility of the total label at the end of each bar
- Value Unit: Unit suffix for values (e.g. 'min', 'sec', 'hrs')
- Show Legend: Toggle visibility of the legend
- Category Font Size: Font size for category labels in pixels
- Value Font Size: Font size for segment/value labels in pixels
- Segment Opacity: Opacity of segment fills (0-100)
- Category Color: Text color for category labels

### Axis Settings
- Show Axis Titles: Toggle visibility of axis titles
- X Axis Title: Title for the X-axis (time values)
- Y Axis Title: Title for the Y-axis (categories)

## How to Use
1. Import the `.pbiviz` file into Power BI Desktop (from the Visuals pane -> ... -> Import from file).
2. Locate the visual in the Visualizations pane and add it to the report canvas.
3. Bind data to one or more of the data roles:
   - Category: Required for meaningful grouping (text or grouping field)
   - At least one of Segment 1, Segment 2, Segment 3: Numeric time values
   - Optional: Total (if not provided, sum of segments is used)
   - Optional: Sort Order (numeric field to control row order)
4. Use the format pane to adjust appearance:
   - Adjust bar dimensions and spacing
   - Set colors and labels for each segment
   - Choose whether to show labels/values inside segments
   - Configure axis titles and legend
5. Interact:
   - Click a bar to cross-filter other visuals by that category
   - Right-click for the context menu
   - Hover to see a tooltip with category, segment values, and total

## Limitations
- The visual expects numeric values for segment measures and total. Non-numeric values are treated as zero.
- If no segment measures are bound, the visual displays an empty state.
- The sort order field, if bound, must be numeric and determines ascending row order.
- Each data role accepts only one field.
- The visual uses a scrollbar when the total content height exceeds the container height.

## Support
For help or questions, visit https://nexuscodex.nexus/support