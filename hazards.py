from fastapi import APIRouter, Query
from typing import Any, Callable, Dict, List, Optional

import pandas as pd


router = APIRouter(prefix="/hazards", tags=["hazards"])

_get_data_func: Optional[Callable[[], Dict[str, pd.DataFrame]]] = None


def init(get_data_func: Callable[[], Dict[str, pd.DataFrame]]):
    global _get_data_func
    _get_data_func = get_data_func


# ---- Local helpers (duplicated small utilities to avoid import cycles) ----
def _safe_int(x: Any) -> int:
    try:
        if pd.isna(x):
            return 0
    except Exception:
        pass
    try:
        return int(x)
    except Exception:
        try:
            return int(float(x))
        except Exception:
            return 0


def _coerce_mixed_excel_dates(series: pd.Series) -> pd.Series:
    if series is None:
        return pd.Series(dtype="datetime64[ns]")
    s = series.copy()
    out = pd.to_datetime(s, errors="coerce")
    numeric = pd.to_numeric(s, errors="coerce")
    num_mask = numeric.notna()
    if num_mask.any():
        out_num = pd.to_datetime(
            numeric[num_mask], origin="1899-12-30", unit="D", errors="coerce"
        )
        out.loc[num_mask] = out_num
    if out.notna().sum() == 0:
        try:
            out = pd.to_datetime(s, errors="coerce", dayfirst=True)
            if num_mask.any():
                out_num = pd.to_datetime(
                    numeric[num_mask], origin="1899-12-30", unit="D", errors="coerce"
                )
                out.loc[num_mask] = out_num
        except Exception:
            pass
    return out


def _get_processed() -> Dict[str, pd.DataFrame]:
    if _get_data_func is None:
        return {}
    try:
        return _get_data_func() or {}
    except Exception:
        return {}


def _norm(s: str) -> str:
    return "".join(ch for ch in str(s).lower() if ch.isalnum())


_PLACEHOLDERS = {"", "nan", "nat", "none", "null", "n/a", "na", "-", "—"}


def _clean_cat(series: pd.Series) -> pd.Series:
    s = series.astype(str).map(lambda x: str(x).strip())
    return s[~s.str.lower().isin(_PLACEHOLDERS)]


def _get_sheet(*candidates: str) -> pd.DataFrame:
    processed = _get_processed()
    if not processed:
        return pd.DataFrame()
    norm_map = { _norm(k): k for k in processed.keys() }
    cand_norms = [_norm(c) for c in candidates]
    for cn in cand_norms:
        if cn in norm_map:
            return processed[norm_map[cn]]
    for cn in cand_norms:
        for nk, ok in norm_map.items():
            if cn and cn in nk:
                return processed[ok]
    return pd.DataFrame()


def _hazard_df() -> pd.DataFrame:
    df = _get_sheet("Hazard ID", "Hazards", "Hazard Log")
    if df is None or df.empty:
        return pd.DataFrame()
    return df.copy()


def _prepare_hazards(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()

    # Normalize headers (do not mutate caller input unexpectedly)
    df = df.copy()
    # Create convenient, canonical columns while preserving originals
    # Dates (choose first available)
    date_candidates = [
        "Date of Occurrence",
        "Date Reported",
        "Hazard Date",
        "Report Date",
        "Date",
        "Occurrence Date",
        "Created Date",
    ]
    date_col = next((c for c in date_candidates if c in df.columns), None)
    if date_col:
        df[date_col] = _coerce_mixed_excel_dates(df[date_col])
        df["occ_month"] = df[date_col].dt.to_period("M").astype(str)
        df["occ_year"] = df[date_col].dt.year

    # Risk level / severity proxy
    # Prefer consequence-based severity when present, then injury potential, then other risk fields
    risk_candidates = [
        "Worst Case Consequence Potential (Hazard ID)",
        "Relevant Consequence (Hazard ID)",
        "Injury Classification",
        "Risk Level",
        "Injury Potential",
        "Risk",
        "Risk Category",
        "Risk Ranking",
        "Risk Rating",
        "Risk Index",
        "Initial Risk",
        "Residual Risk",
        "Severity",
        "Severity Level",
    ]
    rc = next((c for c in risk_candidates if c in df.columns), None)
    if rc:
        df["risk_level"] = df[rc].astype(str).str.strip().str.title()
    else:
        df["risk_level"] = ""

    # Compact location
    location_col = None
    for c in ["Location (EPCL)", "Location", "Specific Location of Occurrence", "Area", "Department", "Line"]:
        if c in df.columns:
            location_col = c
            break
    if location_col:
        df["location_short"] = df[location_col].astype(str).str.strip()
    else:
        df["location_short"] = ""

    # Canonical hazard type/name columns (best-effort)
    incident_type_candidates = [
        "Incident Type(s)",
        "Hazard Type",
        "Hazard Category",
        "Classification",
        "Type",
        "Type of Incident",
    ]
    itc = next((c for c in incident_type_candidates if c in df.columns), None)
    if itc:
        df["incident_type"] = df[itc].astype(str).str.strip()
    else:
        df["incident_type"] = ""

    # Status if present
    status_candidates = [
        "Status",
        "Audit Status",
        "Hazard Status",
        "Case Status",
        "Current Status",
    ]
    sc = next((c for c in status_candidates if c in df.columns), None)
    if sc:
        df["status_norm"] = df[sc].astype(str).str.strip().str.title()
    else:
        df["status_norm"] = ""

    # Title if present
    title_candidates = ["Title", "Hazard Title", "Short Description", "Summary", "Description"]
    tc = next((c for c in title_candidates if c in df.columns), None)
    if tc:
        df["hazard_title"] = df[tc].astype(str).str.strip()
    else:
        df["hazard_title"] = ""

    # Root cause
    root_candidates = [
        "Root Cause",
        "Immediate Cause",
        "Basic Cause",
        "Cause",
        "Probable Cause",
        "Root Cause Category",
        "Contributing Factors",
        "Cause Category",
    ]
    rcc = next((c for c in root_candidates if c in df.columns), None)
    if rcc:
        df["root_cause"] = df[rcc].astype(str).str.strip()
    else:
        df["root_cause"] = ""

    # Violation type (frequently populated and useful fallback for root cause)
    violation_candidates = [
        "Violation Type (Hazard ID)",
        "Violation Type (Incident)",
        "HSE Site Rules Category",
    ]
    vc_col = next((c for c in violation_candidates if c in df.columns), None)
    if vc_col:
        df["violation_type"] = df[vc_col].astype(str).str.strip()
    else:
        df["violation_type"] = ""

    # Immediate/physical causes (another useful categorical)
    if "Physical or Immediate Causes of Incident" in df.columns:
        df["cause_immediate"] = df["Physical or Immediate Causes of Incident"].astype(str).str.strip()
    else:
        df["cause_immediate"] = ""

    return df


def _chart_from_series(series: pd.Series, label: str = "Count") -> Dict[str, Any]:
    series = series.fillna(0)
    return {
        "labels": [str(i) for i in list(series.index)],
        "datasets": [{"label": label, "data": [_safe_int(v) for v in series.values]}],
    }


@router.get("/per-month", response_model=Dict[str, Any])
def hazards_per_month(location: Optional[str] = Query(None, description="Optional location filter")):
    df = _prepare_hazards(_hazard_df())
    if df.empty or "occ_month" not in df.columns:
        return {"labels": [], "datasets": [{"label": "Hazards per Month", "data": []}]}
    sub = df
    if location:
        sub = sub[sub["location_short"].astype(str) == str(location)]
    series = _clean_cat(sub["occ_month"]).value_counts().sort_index()
    return _chart_from_series(series, label="Hazards per Month")


@router.get("/by-risk", response_model=Dict[str, Any])
def hazards_by_risk():
    df = _prepare_hazards(_hazard_df())
    if df.empty:
        return {"labels": [], "datasets": [{"label": "Hazards by Risk", "data": []}]}
    vc = _clean_cat(df["risk_level"]).value_counts()
    return _chart_from_series(vc, label="Hazards by Risk")


@router.get("/by-area", response_model=Dict[str, Any])
def hazards_by_area():
    df = _prepare_hazards(_hazard_df())
    if df.empty:
        return {"labels": [], "datasets": [{"label": "Hazards by Area", "data": []}]}
    # Prefer explicit Area/Department/Line; fallback to location_short
    for col, label in [
        ("Area", "Hazards by Area"),
        ("Department", "Hazards by Department"),
        ("Line", "Hazards by Line"),
    ]:
        if col in df.columns:
            s = _clean_cat(df[col]).value_counts()
            return _chart_from_series(s, label=label)
    s = _clean_cat(df["location_short"]).value_counts()
    return _chart_from_series(s, label="Hazards by Location")


@router.get("/top", response_model=Dict[str, Any])
def hazards_top(
    by: str = Query("root cause", description="Column to rank by: title, incident type(s), hazard type, root cause, violation type, immediate cause"),
    n: int = Query(10, ge=1, le=50),
):
    df = _prepare_hazards(_hazard_df())
    if df.empty:
        return {"labels": [], "datasets": [{"label": "Top", "data": []}]}
    by_n = by.strip().lower()
    col_map = {
        "title": "hazard_title",
        "incident type(s)": "incident_type",
        "hazard type": "incident_type",
        "root cause": "root_cause",
        "violation type": "violation_type",
        "immediate cause": "cause_immediate",
    }
    col = col_map.get(by_n)
    if not col or col not in df.columns:
        return {"labels": [], "datasets": [{"label": "Top", "data": []}]}
    s = _clean_cat(df[col]).value_counts().head(n)
    return _chart_from_series(s, label=f"Top {by_n.title()}")


@router.get("/heatmap", response_model=Dict[str, Any])
def hazards_heatmap(
    top_locs: int = Query(15, ge=1, le=100),
    top_types: int = Query(10, ge=1, le=100),
):
    df = _prepare_hazards(_hazard_df())
    if df.empty:
        return {"x_labels": [], "y_labels": [], "values": [], "min": 0, "max": 0, "title": "Hazard Heatmap"}
    if "location_short" not in df.columns or "incident_type" not in df.columns:
        return {"x_labels": [], "y_labels": [], "values": [], "min": 0, "max": 0, "title": "Hazard Heatmap"}
    # Filter out placeholder categories to avoid 'nan' rows/columns
    loc = df["location_short"].astype(str).str.strip()
    typ = df["incident_type"].astype(str).str.strip()
    mask = ~loc.str.lower().isin(_PLACEHOLDERS) & ~typ.str.lower().isin(_PLACEHOLDERS)
    filtered = df.loc[mask, ["location_short", "incident_type"]]
    pivot = pd.crosstab(filtered["location_short"], filtered["incident_type"])
    # narrow to top locations/types for readability
    top_loc_idx = pivot.sum(axis=1).sort_values(ascending=False).head(top_locs).index
    top_type_idx = pivot.sum(axis=0).sort_values(ascending=False).head(top_types).index
    sub = pivot.loc[top_loc_idx, top_type_idx].fillna(0).astype(int)
    x_labels = [str(x) for x in list(sub.columns)]
    y_labels = [str(y) for y in list(sub.index)]
    values = [[_safe_int(v) for v in row] for row in sub.values.tolist()]
    flat = [v for row in values for v in row]
    vmin = min(flat) if flat else 0
    vmax = max(flat) if flat else 0
    return {"x_labels": x_labels, "y_labels": y_labels, "values": values, "min": vmin, "max": vmax, "title": "Heatmap: Location vs Hazard Type"}


@router.get("/status-trend", response_model=Dict[str, Any])
def hazards_status_trend():
    df = _prepare_hazards(_hazard_df())
    if df.empty or "occ_month" not in df.columns or "status_norm" not in df.columns:
        return {"labels": [], "datasets": []}
    om = df["occ_month"].astype(str).str.strip()
    st = df["status_norm"].astype(str).str.strip()
    mask = ~om.str.lower().isin(_PLACEHOLDERS) & ~st.str.lower().isin(_PLACEHOLDERS)
    sub = df.loc[mask, ["occ_month", "status_norm"]]
    grouped = sub.groupby(["occ_month", "status_norm"]).size().unstack(fill_value=0)
    labels = [str(m) for m in grouped.index.tolist()]
    datasets: List[Dict[str, Any]] = []
    for status in grouped.columns:
        datasets.append({"label": str(status), "data": [_safe_int(v) for v in grouped[status].tolist()]})
    return {"labels": labels, "datasets": datasets}


@router.get("/insights", response_model=Dict[str, Any])
def hazards_insights():
    df = _prepare_hazards(_hazard_df())
    out: Dict[str, Any] = {}
    if df.empty:
        return out
    # Monthly
    if "occ_month" in df.columns:
        out["hazards_per_month"] = _clean_cat(df["occ_month"]).value_counts().sort_index().to_dict()
    # Risk
    if "risk_level" in df.columns:
        out["hazards_by_risk"] = _clean_cat(df["risk_level"]).value_counts().to_dict()
    # Location
    out["hazards_by_location"] = _clean_cat(df["location_short"]).value_counts().to_dict()
    # Status
    if "status_norm" in df.columns:
        out["status_counts"] = _clean_cat(df["status_norm"]).value_counts().to_dict()
    # Tops
    if "hazard_title" in df.columns:
        out["top_title"] = _clean_cat(df["hazard_title"]).value_counts().head(10).to_dict()
    if "incident_type" in df.columns:
        out["top_incident_type"] = _clean_cat(df["incident_type"]).value_counts().head(10).to_dict()
    if "root_cause" in df.columns:
        out["top_root_cause"] = _clean_cat(df["root_cause"]).value_counts().head(10).to_dict()
    # Heatmap nested
    if "location_short" in df.columns and "incident_type" in df.columns:
        loc = df["location_short"].astype(str).str.strip()
        typ = df["incident_type"].astype(str).str.strip()
        mask = ~loc.str.lower().isin(_PLACEHOLDERS) & ~typ.str.lower().isin(_PLACEHOLDERS)
        filtered = df.loc[mask, ["location_short", "incident_type"]]
        pivot = pd.crosstab(filtered["location_short"], filtered["incident_type"]).fillna(0).astype(int)
        # Include only top slices for compactness
        tl = pivot.sum(axis=1).sort_values(ascending=False).head(15).index
        tt = pivot.sum(axis=0).sort_values(ascending=False).head(10).index
        out["heatmap"] = pivot.loc[tl, tt].to_dict()
    return out


@router.get("/compare-by-department", response_model=Dict[str, Any])
def hazards_vs_incidents_by_department(top_n: int = Query(30, ge=1, le=100)):
    """Return stacked/grouped chart JSON comparing Hazards vs Incidents by Department/Section.
    Chooses the best available categorical column among ['Department', 'Section', 'Area'].
    Filters out blanks/placeholder categories.
    """
    processed = _get_processed()
    if not processed:
        return {"labels": [], "datasets": []}

    haz = _hazard_df()
    inc = _get_sheet("Incident", "Incidents", "Incident Log")
    if (haz is None or haz.empty) and (inc is None or inc.empty):
        return {"labels": [], "datasets": []}

    # Pick a common categorical column name
    cat_candidates = ["Department", "Section", "Area"]
    haz_cat = next((c for c in cat_candidates if c in (haz.columns if haz is not None else [])), None)
    inc_cat = next((c for c in cat_candidates if c in (inc.columns if inc is not None else [])), None)
    if not haz_cat and not inc_cat:
        return {"labels": [], "datasets": []}

    # Build cleaned series for both
    haz_series = pd.Series(dtype=int)
    if haz_cat and haz is not None and not haz.empty:
        haz_series = _clean_cat(haz[haz_cat]).value_counts()

    inc_series = pd.Series(dtype=int)
    if inc_cat and inc is not None and not inc.empty:
        inc_series = _clean_cat(inc[inc_cat]).value_counts()

    # Union of categories, order by total desc then name
    all_labels = sorted(set(haz_series.index.astype(str)).union(set(inc_series.index.astype(str))))
    totals = {k: int(haz_series.get(k, 0)) + int(inc_series.get(k, 0)) for k in all_labels}
    all_labels = sorted(all_labels, key=lambda k: (-totals.get(k, 0), str(k)))[:top_n]

    haz_data = [int(haz_series.get(k, 0)) for k in all_labels]
    inc_data = [int(inc_series.get(k, 0)) for k in all_labels]

    return {
        "labels": all_labels,
        "datasets": [
            {"label": "Hazards", "data": haz_data},
            {"label": "Incidents", "data": inc_data},
        ],
    }


