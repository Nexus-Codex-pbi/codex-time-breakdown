# User Guide for Codex Time Breakdown

## Adding the Visual
1. Open Power BI Desktop or Power BI Service
2. Navigate to the Visualizations pane
3. Select the Codex Time Breakdown visual from the visual gallery
4. Drag and drop the visual onto your report canvas

## Data Binding

### Required Fields
- **Category**: Scenario label (e.g. 'Battery Not Available', 'Battery Sold')
  - Data Type: Text/String
  - Purpose: Identifies each row in the breakdown visualization

- **Segment 1**: First time segment measure (e.g. Avg Dispatch Time)
  - Data Type: Numeric
  - Purpose: Represents the first portion of the time breakdown

- **Segment 2**: Second time segment measure (e.g. Avg Travel Time)
  - Data Type: Numeric
  - Purpose: Represents the second portion of the time breakdown

- **Segment 3**: Third time segment measure (e.g. Avg At Scene Time)
  - Data Type: Numeric
  - Purpose: Represents the third portion of the time breakdown

- **Total**: Total time measure — shown as end label
  - Data Type: Numeric
  - Purpose: Displays the overall total time value

### Optional Fields
- **Sort Order**: Numeric sort order — rows sorted ascending by this value
  - Data Type: Numeric
  - Purpose: Controls the display order of rows in the visualization

## Formatting Options

### Time Breakdown Style Settings
- **Bar Height**: Adjust the height of the horizontal bars
- **Bar Radius**: Control the corner rounding of bars
- **Row Spacing**: Set spacing between rows
- **Segment Colors**: Customize colors for each of the three segments
- **Segment Labels**: Set custom labels for each segment
- **Total Color**: Set color for total value display
- **Show Segment Labels**: Toggle display of segment labels on bars
- **Show Segment Values**: Toggle display of segment values on bars
- **Show Total Label**: Toggle display of total values at end of bars
- **Value Unit**: Add unit suffix to all numeric values (e.g., "min", "hrs")
- **Show Legend**: Toggle display of segment legend
- **Category Font Size**: Adjust font size for category labels
- **Value Font Size**: Adjust font size for value labels
- **Segment Opacity**: Control transparency of segment bars
- **Category Color**: Set color for category text

### Axis Settings
- **Show Axis Titles**: Toggle display of axis titles
- **X Axis Title**: Set label for horizontal axis
- **Y Axis Title**: Set label for vertical axis

## Features
1. **Horizontal Stacked Bar Visualization**: Compare time segments side-by-side
2. **Customizable Segments**: Configure up to three time segments with custom labels
3. **Interactive Tooltips**: Hover over any element to see detailed information
4. **Cross-Filtering**: Click on rows to filter other visuals on the report page
5. **Responsive Design**: Adapts to different screen sizes and resolutions
6. **Scrollable Content**: Automatically adds scrollbars for large datasets
7. **Customizable Appearance**: Extensive formatting options for colors, fonts, and layout
8. **Legend Support**: Optional legend for identifying segment meanings

## Limitations
- Maximum of 30,000 data points supported due to Power BI data reduction limits
- Requires numeric measures for all segment values
- Limited to three segments per category
- Some advanced formatting options require Power BI Premium features

## Known Issues
None reported at this time.

## Support
For support, please visit: https://nexuscodex.nexus/support
GitHub repository: https://github.com/Nexus-Codex-pbi/codex-time-breakdown