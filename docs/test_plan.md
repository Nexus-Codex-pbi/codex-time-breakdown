# Test Plan for Codex Time Breakdown

## Functional Tests

### Rendering Tests
- [ ] Visual renders correctly with all required data fields populated
- [ ] Visual shows empty state when no data is provided
- [ ] Visual shows landing page guidance when first added to canvas
- [ ] Rows render in correct order based on sort values
- [ ] Bar segments render with correct proportional widths
- [ ] Text labels display within bar segments when space permits
- [ ] Text labels display above bar segments when space is insufficient
- [ ] Total labels render at the end of each row
- [ ] Legend renders correctly when enabled
- [ ] Axis titles render correctly when enabled

### Formatting Tests
- [ ] Bar Height setting adjusts bar heights correctly
- [ ] Bar Radius setting adjusts corner rounding correctly
- [ ] Row Spacing setting adjusts vertical spacing correctly
- [ ] Segment colors apply correctly to respective segments
- [ ] Segment labels display correctly on bars
- [ ] Segment values display correctly on bars
- [ ] Total Color setting applies to total labels
- [ ] Show Segment Labels toggle works correctly
- [ ] Show Segment Values toggle works correctly
- [ ] Show Total Label toggle works correctly
- [ ] Value Unit setting appends correctly to numeric values
- [ ] Show Legend toggle works correctly
- [ ] Category Font Size setting adjusts category text size
- [ ] Value Font Size setting adjusts value text size
- [ ] Segment Opacity setting adjusts segment transparency
- [ ] Category Color setting applies to category text
- [ ] Show Axis Titles toggle works correctly
- [ ] X Axis Title setting displays correctly
- [ ] Y Axis Title setting displays correctly

### Interaction Tests
- [ ] Row click triggers cross-filtering to other visuals
- [ ] Tooltip appears on hover with correct information
- [ ] Tooltip disappears on mouse leave
- [ ] Context menu appears on right-click
- [ ] Scroll container works with overflowing content
- [ ] Selection highlighting works correctly

### Data Tests
- [ ] Visual handles null/empty values gracefully
- [ ] Visual handles zero values correctly (no segment rendered)
- [ ] Visual handles negative numeric values appropriately
- [ ] Visual handles large numeric values correctly
- [ ] Visual handles special characters in text fields
- [ ] Visual handles Unicode characters in text fields
- [ ] Visual sorts rows correctly by sort order
- [ ] Visual handles maximum data limit (30,000 items)

## Performance Tests
- [ ] Visual loads within acceptable time with small dataset (<100 items)
- [ ] Visual loads within acceptable time with medium dataset (100-1000 items)
- [ ] Visual loads within acceptable time with large dataset (1000+ items)
- [ ] Visual maintains responsiveness during interaction
- [ ] Memory usage remains stable during repeated updates
- [ ] No memory leaks detected during extended testing
- [ ] Scroll performance is smooth with many rows
- [ ] Tooltip display is responsive during rapid hovering

## Accessibility Tests
- [ ] Visual is fully navigable using keyboard only
- [ ] All interactive elements receive keyboard focus
- [ ] Focus indicators are clearly visible
- [ ] Screen reader can interpret visual content
- [ ] High contrast mode displays correctly
- [ ] Text scaling up to 200% works without clipping
- [ ] Color contrast meets WCAG 2.1 AA requirements
- [ ] Proper ARIA attributes are present

## Security Tests
- [ ] Visual makes no external network requests
- [ ] Visual does not execute dynamic JavaScript
- [ ] Visual handles data securely through Power BI APIs only
- [ ] Visual does not store sensitive data
- [ ] Visual does not access browser storage without permission

## Packaging Tests
- [ ] Visual package builds successfully
- [ ] Visual imports correctly into Power BI Desktop
- [ ] Visual functions correctly in Power BI Service
- [ ] Visual icon displays correctly in visualization pane
- [ ] Visual metadata displays correctly in marketplace

## Sample PBIX Verification
- [ ] Sample PBIX file loads without errors
- [ ] Visual renders correctly in sample file
- [ ] All data roles populate correctly with sample data
- [ ] Formatting options work correctly with sample data
- [ ] Interactions work correctly with sample data
- [ ] Cross-filtering works with other visuals in sample