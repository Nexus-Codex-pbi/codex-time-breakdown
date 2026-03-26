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
}

export interface TimeBreakdownData {
    rows: TimeBreakdownRow[];
    maxTotal: number;
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
                const v = typeof raw === "number" ? raw : Number(raw) || 0;
                if (v > 0) {
                    segments.push({ value: v, roleIndex: s });
                    segmentSum += v;
                }
            }
        }

        // Total — use explicit total if provided, otherwise sum segments
        let total: number | null = null;
        if (roleMap["totalValue"] !== undefined) {
            const raw = vals[roleMap["totalValue"]].values[r];
            total = typeof raw === "number" ? raw : Number(raw) || null;
        }

        const effectiveTotal = total ?? segmentSum;
        if (effectiveTotal > maxTotal) maxTotal = effectiveTotal;

        rows.push({
            category: String(cats[r] ?? ""),
            segments,
            total,
        });
    }

    return { rows, maxTotal };
}
