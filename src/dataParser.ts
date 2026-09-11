import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;

export interface SegmentData {
    value: number;
    roleIndex: number; // 0-based segment index
    /** The measure column's own Power BI model format string ("0.00", "#,##0.##"),
     *  carried so the renderer can honour its precision instead of rounding
     *  every duration to a whole number (NEXUS cycle-13 §4). */
    format: string | null;
}

export interface TimeBreakdownRow {
    category: string;
    categoryIndex: number;
    segments: SegmentData[];
    /** The explicit Total measure. null when the role is unbound, blank or
     *  non-numeric — never a substituted zero. */
    total: number | null;
    /**
     *  The total derived from this row's OWN duration readings, or null when
     *  no assertable total exists (NEXUS cycle-13 §3):
     *    - no segment reading at all (all blank / no measures bound) -> null,
     *      so an absent duration renders as a gap and is never displayed as a
     *      measured `0 min` indistinguishable from an observed all-zero row;
     *    - a NEGATIVE reading -> null, because a negative duration cannot be
     *      drawn as a length and silently dropping it from the sum published a
     *      total (50) that contradicts its own inputs (-10, 20, 30).
     *  An observed zero is a reading, so an all-zero row still derives 0.
     */
    derivedTotal: number | null;
    sortOrder: number | null;
}

export interface TimeBreakdownData {
    rows: TimeBreakdownRow[];
    maxTotal: number;
    /** Model format string for total values (the Total measure's own, falling
     *  back to the first bound segment measure's). NEXUS cycle-13 §4. */
    totalFormat: string | null;
}

/**
 *  1180.2.4 Data Types — blank and non-numeric input must never become a measured
 *  value, and `||` must never swallow a legitimate zero. The previous
 *  `Number(raw) || 0` / `Number(raw) || null` form was saved for a NUMERIC zero by
 *  its `typeof raw === "number"` branch, but a STRING "0" still collapsed to null —
 *  which silently replaced an explicit total of zero with the segment sum, and sorted
 *  a row whose sort order was "0" to the very end. The reviewer's test model includes
 *  a String values table, so that path is exercised.
 */
function asNumberOrNull(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "string" && raw.trim() === "") return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
}

export function parseDataView(dv: DataView): TimeBreakdownData | null {
    if (!dv?.categorical?.categories?.[0]?.values?.length) return null;

    const cats = dv.categorical.categories[0].values;
    const vals = dv.categorical.values || [];

    // Map role names to value column indices
    const roleMap: Record<string, number> = {};
    for (let i = 0; i < vals.length; i++) {
        const roleName = vals[i].source.roles
            ? Object.keys(vals[i].source.roles)[0]
            : "";
        roleMap[roleName] = i;
    }

    const formatOf = (columnIndex: number): string | null =>
        (columnIndex !== undefined && vals[columnIndex]?.source?.format) || null;

    // Total values carry the Total measure's own model format; when that role is
    // unbound the derived total is a sum of segments, so the first bound segment
    // measure's format describes it (NEXUS cycle-13 §4).
    const firstSegmentColumn = ["segment1", "segment2", "segment3"]
        .map(role => roleMap[role])
        .find(index => index !== undefined);
    const totalFormat = roleMap["totalValue"] !== undefined
        ? formatOf(roleMap["totalValue"])
        : formatOf(firstSegmentColumn);

    const rows: TimeBreakdownRow[] = [];
    let maxTotal = 0;

    for (let r = 0; r < cats.length; r++) {
        const segments: SegmentData[] = [];
        let segmentSum = 0;
        // NEXUS cycle-13 §3 — absent, observed-zero and invalid readings are
        // three different things and only the middle one is a measured zero.
        let sawReading = false;
        let sawInvalidReading = false;

        // Extract up to 3 segments
        for (let s = 0; s < 3; s++) {
            const role = `segment${s + 1}`;
            if (roleMap[role] !== undefined) {
                const raw = vals[roleMap[role]].values[r];
                // 1180.2.4: blank/non-numeric is absent data, not a zero-length segment.
                const v = asNumberOrNull(raw);
                if (v === null) continue;              // stays a gap
                if (v < 0) { sawInvalidReading = true; continue; }  // §3: rejected, never folded into a sum
                sawReading = true;
                segmentSum += v;
                // A zero-length segment draws nothing (unchanged behaviour); it
                // still counts as an observed reading for the derived total.
                if (v > 0) segments.push({ value: v, roleIndex: s, format: formatOf(roleMap[role]) });
            }
        }

        // Total — use explicit total if provided, otherwise sum segments
        let total: number | null = null;
        if (roleMap["totalValue"] !== undefined) {
            const raw = vals[roleMap["totalValue"]].values[r];
            total = asNumberOrNull(raw);   // 1180.2.4: keeps an explicit total of 0
        }

        const derivedTotal: number | null = sawInvalidReading || !sawReading ? null : segmentSum;

        // Sort order
        let sortOrder: number | null = null;
        if (roleMap["sortOrder"] !== undefined) {
            const raw = vals[roleMap["sortOrder"]].values[r];
            sortOrder = asNumberOrNull(raw);   // 1180.2.4: keeps sort order 0 first
        }

        // ─── Shared-scale domain (NEXUS cycle-13 §2) ───────────────────────
        // The domain has to cover EVERYTHING the row draws. It previously used
        // `total ?? segmentSum`, so a row whose explicit Total disagreed with
        // its own segments (Total 0 or 6 against a 60-minute stack) set a
        // domain smaller than the stack it then scaled against: 10+20+30 with
        // an explicit Total of 0 collapsed maxTotal to 0, the renderer
        // substituted a maximum of 1, and the stack ran ~49,700px across a
        // 900px tile with no horizontal scroll access to it. Taking the larger
        // of the drawn stack and the declared total keeps the stack inside the
        // scale while still letting an explicit total LARGER than its segments
        // stretch the axis exactly as it did before.
        const scaleExtent = Math.max(segmentSum, total ?? 0);
        if (scaleExtent > maxTotal) maxTotal = scaleExtent;

        rows.push({
            category: String(cats[r] ?? ""),
            categoryIndex: r,
            segments,
            total,
            derivedTotal,
            sortOrder,
        });
    }

    // Sort by sortOrder ascending if any row has a sort order value
    const hasSortOrder = rows.some(r => r.sortOrder !== null);
    if (hasSortOrder) {
        rows.sort((a, b) => {
            const aVal = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
            const bVal = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
            return aVal - bVal;
        });
    }

    return { rows, maxTotal, totalFormat };
}
