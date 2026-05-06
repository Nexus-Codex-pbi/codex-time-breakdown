# Security Statement for optiStockTimeBreakdown

## External Network Access
The visual does not make any external network calls. It contains no `externalJS` in the pbiviz.json and no `fetch`, `XMLHttpRequest`, or similar networking code in the source.

## Telemetry
The visual does not collect or transmit any telemetry data. There are no calls to tracking services or custom telemetry logic.

## Data Handling
The visual only processes data provided via the Power BI dataView pipeline. It does not store, cache, or transmit any data outside the visual instance. All data is held in memory during the visual's lifetime and is released when the visual is destroyed.

## Script Safety
- No use of `eval()` or similar dynamic code execution.
- No use of `innerHTML`; all DOM updates are performed via SVG DOM API methods (`appendChild`, `setAttribute`, etc.) and D3.js, which are safe when used as in this visual.
- All user-provided strings (from data or formatting properties) are treated as plain text and safely inserted into the DOM via `textContent` or equivalent safe methods.

## Cross-Visual Interaction
The visual supports cross-filtering and highlighting:
- When a row is clicked, it emits a selection event via the `ISelectionManager` that filters other visuals on the report page by the category value of that row.
- The visual also respects external filters applied by other visuals (filter-in) and updates its display accordingly.
- The visual supports highlighting from other visuals (when they are selected) and will highlight the corresponding rows.

## Dependencies
The visual depends on the following approved Power BI libraries:
- `powerbi-visuals-api`
- `powerbi-visuals-utils-formattingmodel`
Additionally, it uses D3.js (version 5.x) for SVG rendering, which is included as a dependency in the package.json and is bundled with the visual.

## Permissions
The visual requires no special permissions beyond those granted to standard Power BI custom visuals. The `privileges` array in `capabilities.json` is empty.

## Summary
optiStockTimeBreakdown is a secure Power BI custom visual that adheres to Microsoft's security and privacy requirements. It processes data locally, uses only approved APIs and safe DOM/SVG practices, and implements proper cross-visual interaction via the Power BI extensibility model.