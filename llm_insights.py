import json
from typing import Any, Dict
import pandas as pd

# Lightweight helpers (avoid importing FastAPI app to prevent circular imports)

def _safe_int(x):
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

def _find_date_series(df: pd.DataFrame) -> pd.Series:
    """Robustly find a date-like series.
    Tries known columns first, then any column; handles Excel serials for numerics.
    """
    if df is None or df.empty:
        return pd.Series(dtype='datetime64[ns]')
    candidates = [
        'Date of Occurrence', 'Incident Date', 'Hazard Date', 'Report Date',
        'Date Reported', 'Start Date', 'End Date', 'Date', 'Occurrence Date', 'Created Date'
    ]
    # First pass: known columns, with Excel-serial handling
    for col in candidates:
        if col in df.columns:
            s_raw = df[col]
            s = pd.to_datetime(s_raw, errors='coerce')
            if s.notna().any():
                return s
            # Try Excel serials if numeric
            if pd.api.types.is_numeric_dtype(s_raw):
                try:
                    s2 = pd.to_datetime(s_raw, unit='D', origin='1899-12-30', errors='coerce')
                    if s2.notna().any():
                        return s2
                except Exception:
                    pass
    # Second pass: any column
    for col in df.columns:
        s_raw = df[col]
        try:
            s = pd.to_datetime(s_raw, errors='coerce')
            if s.notna().any():
                return s
            if pd.api.types.is_numeric_dtype(s_raw):
                s2 = pd.to_datetime(s_raw, unit='D', origin='1899-12-30', errors='coerce')
                if s2.notna().any():
                    return s2
        except Exception:
            continue
    return pd.Series(dtype='datetime64[ns]')


def _clean_value_counts(series: pd.Series) -> dict:
    """Return value_counts as dict with placeholder/null values removed.
    Drops blanks, 'nan', 'none', '-', '—'. Trims whitespace.
    """
    if series is None or series.empty:
        return {}
    s = series.astype(str).map(lambda x: str(x).strip())
    s = s[s.str.len() > 0]
    placeholders = {"na", "n/a", "none", "nan", "-", "—", "null"}
    s = s[~s.str.lower().isin(placeholders)]
    return s.value_counts().to_dict()


def compute_insights(processed_data: Dict[str, pd.DataFrame]) -> Dict[str, Any]:
    """Build a compact knowledge base of pre-computed insights from the Excel sheets.
    Never include raw rows — only aggregated counts/trends.
    """
    kb: Dict[str, Any] = {}

    def get_sheet(*names: str) -> pd.DataFrame:
        # fuzzy match by normalized name
        def _norm(s: str) -> str:
            return ''.join(ch for ch in str(s).lower() if ch.isalnum())
        if not processed_data:
            return pd.DataFrame()
        norm_map = { _norm(k): k for k in processed_data.keys() }
        cand_norms = [_norm(n) for n in names]
        for cn in cand_norms:
            if cn in norm_map:
                return processed_data[norm_map[cn]]
        for cn in cand_norms:
            for nk, ok in norm_map.items():
                if cn and cn in nk:
                    return processed_data[ok]
        return pd.DataFrame()

    # Incident sheet
    inc = get_sheet('Incident', 'Incidents', 'Incident Log')
    if not inc.empty:
        kb['incidents_total'] = int(len(inc))
        s = _find_date_series(inc).dropna()
        if not s.empty:
            kb['incidents_per_month'] = { str(p): _safe_int(c) for p, c in s.dt.to_period('M').value_counts().sort_index().items() }
            kb['incidents_total_dated'] = int(len(s))
        if 'Location (EPCL)' in inc.columns:
            kb['incidents_by_location'] = _clean_value_counts(inc['Location (EPCL)'])
        if 'Line' in inc.columns:
            kb['incidents_by_line'] = _clean_value_counts(inc['Line'])
        elif 'Department' in inc.columns:
            kb['incidents_by_department'] = _clean_value_counts(inc['Department'])
        if 'Incident Type(s)' in inc.columns:
            types: Dict[str, int] = {}
            for v in inc['Incident Type(s)'].dropna():
                for t in str(v).split('; '):
                    if t:
                        types[t] = types.get(t, 0) + 1
            kb['incidents_by_type'] = types

    # Hazard sheet
    haz = get_sheet('Hazard ID', 'Hazards', 'Hazard Log')
    if not haz.empty:
        kb['hazards_total'] = int(len(haz))
        # prefer Date Reported
        if 'Date Reported' in haz.columns:
            s = pd.to_datetime(haz['Date Reported'], errors='coerce').dropna()
        else:
            s = _find_date_series(haz).dropna()
        if not s.empty:
            kb['hazards_per_month'] = { str(p): _safe_int(c) for p, c in s.dt.to_period('M').value_counts().sort_index().items() }
            kb['hazards_total_dated'] = int(len(s))
        if 'Location (EPCL)' in haz.columns:
            kb['hazards_by_location'] = _clean_value_counts(haz['Location (EPCL)'])
        if 'Risk Level' in haz.columns:
            kb['hazards_by_risk'] = _clean_value_counts(haz['Risk Level'])
        if 'Status' in haz.columns:
            kb['hazards_by_status'] = _clean_value_counts(haz['Status'])
        if 'Line' in haz.columns:
            kb['hazards_by_line'] = _clean_value_counts(haz['Line'])

    # Audits
    aud = get_sheet('Audit', 'Audits')
    if not aud.empty:
        kb['audits_total'] = int(len(aud))
        s = None
        if 'Start Date' in aud.columns:
            s = pd.to_datetime(aud['Start Date'], errors='coerce').dropna()
        if s is None or s.empty:
            s = _find_date_series(aud).dropna()
        if not s.empty:
            kb['audits_per_month'] = { str(p): _safe_int(c) for p, c in s.dt.to_period('M').value_counts().sort_index().items() }
            kb['audits_total_dated'] = int(len(s))
        if 'Department' in aud.columns:
            kb['audits_by_department'] = _clean_value_counts(aud['Department'])
        if 'Audit Status' in aud.columns:
            kb['audits_by_status'] = _clean_value_counts(aud['Audit Status'])

    # Audit Findings
    af = get_sheet('Audit Findings', 'Audit Finding')
    if not af.empty:
        kb['audit_findings_total'] = int(len(af))
        if 'Severity' in af.columns:
            kb['audit_findings_by_severity'] = _clean_value_counts(af['Severity'])
        if 'Status' in af.columns:
            kb['audit_findings_by_status'] = _clean_value_counts(af['Status'])

    # Inspections
    ins = get_sheet('Inspection', 'Inspections')
    if not ins.empty:
        kb['inspections_total'] = int(len(ins))
        s = None
        if 'Start Date' in ins.columns:
            s = pd.to_datetime(ins['Start Date'], errors='coerce').dropna()
        if s is None or s.empty:
            s = _find_date_series(ins).dropna()
        if not s.empty:
            kb['inspections_per_month'] = { str(p): _safe_int(c) for p, c in s.dt.to_period('M').value_counts().sort_index().items() }
            kb['inspections_total_dated'] = int(len(s))
        if 'Area' in ins.columns:
            kb['inspections_by_area'] = _clean_value_counts(ins['Area'])
        if 'Department' in ins.columns and 'inspections_by_area' not in kb:
            kb['inspections_by_department'] = _clean_value_counts(ins['Department'])
        if 'Status' in ins.columns:
            kb['inspections_by_status'] = _clean_value_counts(ins['Status'])

    # Inspection Findings
    inf = get_sheet('Inspection Findings', 'Inspection Finding')
    if not inf.empty:
        kb['inspection_findings_total'] = int(len(inf))
        if 'Severity' in inf.columns:
            kb['inspection_findings_by_severity'] = _clean_value_counts(inf['Severity'])
        if 'Status' in inf.columns:
            kb['inspection_findings_status'] = _clean_value_counts(inf['Status'])

    return kb


def select_relevant_insights(kb: Dict[str, Any], question: str) -> Dict[str, Any]:
    q = (question or '').lower()
    rel: Dict[str, Any] = {}

    def add(keys):
        for k in keys:
            if k in kb:
                rel[k] = kb[k]

    if any(w in q for w in ['incident']):
        # location-focused
        if any(w in q for w in ['location', 'where', 'area', 'line', 'department']):
            add(['incidents_by_location', 'incidents_by_line', 'incidents_by_department'])
        else:
            add(['incidents_per_month', 'incidents_by_line', 'incidents_by_department', 'incidents_by_type'])
        add(['incidents_total', 'incidents_total_dated'])
    if 'hazard' in q:
        if any(w in q for w in ['location', 'where', 'area', 'line', 'department']):
            add(['hazards_by_location', 'hazards_by_line', 'hazards_by_status'])
        else:
            add(['hazards_per_month', 'hazards_by_risk', 'hazards_by_status', 'hazards_by_line'])
        add(['hazards_total', 'hazards_total_dated'])
    if 'audit' in q and 'finding' not in q:
        add(['audits_per_month', 'audits_by_department', 'audits_by_status', 'audits_total', 'audits_total_dated'])
    if 'audit' in q and 'finding' in q:
        add(['audit_findings_by_severity', 'audit_findings_by_status', 'audit_findings_total'])
    if 'inspection' in q and 'finding' not in q:
        add(['inspections_per_month', 'inspections_by_area', 'inspections_by_department', 'inspections_by_status', 'inspections_total', 'inspections_total_dated'])
    if 'inspection' in q and 'finding' in q:
        add(['inspection_findings_by_severity', 'inspection_findings_status', 'inspection_findings_total'])

    # Totals intent
    if any(w in q for w in ['total', 'overall', 'count']) and 'incident' in q:
        add(['incidents_total', 'incidents_total_dated'])
    if any(w in q for w in ['total', 'overall', 'count']) and 'hazard' in q:
        add(['hazards_total', 'hazards_total_dated'])
    if any(w in q for w in ['total', 'overall', 'count']) and ('audit' in q and 'finding' not in q):
        add(['audits_total', 'audits_total_dated'])
    if any(w in q for w in ['total', 'overall', 'count']) and ('inspection' in q and 'finding' not in q):
        add(['inspections_total', 'inspections_total_dated'])

    # if nothing matched, include some top-level summary keys
    if not rel:
        add(['incidents_per_month', 'hazards_per_month', 'audits_per_month', 'inspections_per_month'])

    return rel
