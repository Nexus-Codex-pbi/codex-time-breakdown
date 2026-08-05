import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;

export interface SegmentData {
    value: number;
    roleIndex: number; // 0-based segment index
}

export interface TimeBreakdownRow {
    category: string;
    segments: SegmentData[];
    total: number | null;
    sortOrder: number | null;
}

export interface TimeBreakdownData {
    rows: TimeBreakdownRow[];
    maxTotal: number;
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

    const rows: TimeBreakdownRow[] = [];
    let maxTotal = 0;

    for (let r = 0; r < cats.length; r++) {
        const segments: SegmentData[] = [];
        let segmentSum = 0;

        // Extract up to 3 segments
        for (let s = 0; s < 3; s++) {
            const role = `segment${s + 1}`;
            if (roleMap[role] !== undefined) {
                const raw = vals[roleMap[role]].values[r];
                // 1180.2.4: blank/non-numeric is absent data, not a zero-length segment.
                const v = asNumberOrNull(raw);
                if (v !== null && v > 0) {
                    segments.push({ value: v, roleIndex: s });
                    segmentSum += v;
                }
            }
        }

        // Total — use explicit total if provided, otherwise sum segments
        let total: number | null = null;
        if (roleMap["totalValue"] !== undefined) {
            const raw = vals[roleMap["totalValue"]].values[r];
            total = asNumberOrNull(raw);   // 1180.2.4: keeps an explicit total of 0
        }

        // Sort order
        let sortOrder: number | null = null;
        if (roleMap["sortOrder"] !== undefined) {
            const raw = vals[roleMap["sortOrder"]].values[r];
            sortOrder = asNumberOrNull(raw);   // 1180.2.4: keeps sort order 0 first
        }

        const effectiveTotal = total ?? segmentSum;
        if (effectiveTotal > maxTotal) maxTotal = effectiveTotal;

        rows.push({
            category: String(cats[r] ?? ""),
            segments,
            total,
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

    return { rows, maxTotal };
}
