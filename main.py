from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from hazards import router as hazards_router, init as hazards_init
from llm_insights import compute_insights, select_relevant_insights
from llm_openai import stream_answer
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

import pandas as pd
from typing import Dict, Any, List
import io
from datetime import datetime
import math  # For NaN handling if needed
import json

app = FastAPI(title="EPCL VEHS Data API", description="API to upload and process EPCL VEHS Excel file and expose charts data")

# Enable CORS for local development (Next.js on port 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variable to store processed data
processed_data: Dict[str, pd.DataFrame] = {}
insights_kb: Dict[str, Any] = {}

# Expose processed data to hazards module and mount its router
def _get_processed_data() -> Dict[str, pd.DataFrame]:
    return processed_data

hazards_init(_get_processed_data)
app.include_router(hazards_router)

# Helper function to convert Excel serial date to datetime
def excel_date_to_datetime(serial_date):
    if pd.isna(serial_date):
        return None
    try:
        return pd.to_datetime('1899-12-30') + pd.to_timedelta(serial_date, 'D')
    except:
        return None

# Robustly coerce a pandas Series that may contain Excel serial numbers and/or strings to datetime64[ns]
def coerce_mixed_excel_dates(series: pd.Series) -> pd.Series:
    if series is None:
        return pd.Series(dtype='datetime64[ns]')
    s = series.copy()
    # First try generic parse for strings/datetimes
    out = pd.to_datetime(s, errors='coerce')
    # Then fix numeric serials using Excel origin
    numeric = pd.to_numeric(s, errors='coerce')
    num_mask = numeric.notna()
    if num_mask.any():
        out_num = pd.to_datetime(numeric[num_mask], origin='1899-12-30', unit='D', errors='coerce')
        out.loc[num_mask] = out_num
    # If many values still NaT, try dayfirst parsing for the remaining string-like values
    if out.notna().sum() == 0:
        try:
            out = pd.to_datetime(s, errors='coerce', dayfirst=True)
            if num_mask.any():
                out_num = pd.to_datetime(numeric[num_mask], origin='1899-12-30', unit='D', errors='coerce')
                out.loc[num_mask] = out_num
        except Exception:
            pass
    return out
# Ensure numeric-like values become native Python ints for JSON serialization
def safe_int(x):
    try:
        # pandas-friendly NaN check
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

# Normalize a sheet name for fuzzy comparison
def _norm(s: str) -> str:
    return "".join(ch for ch in str(s).lower() if ch.isalnum())

# Find a sheet by candidate names (fuzzy match)
def get_sheet(*candidates: str) -> pd.DataFrame:
    if not processed_data:
        return pd.DataFrame()
    norm_map = { _norm(k): k for k in processed_data.keys() }
    cand_norms = [_norm(c) for c in candidates]
    # Exact normalized match
    for cn in cand_norms:
        if cn in norm_map:
            return processed_data[norm_map[cn]]
    # Substring match fallback
    for cn in cand_norms:
        for nk, ok in norm_map.items():
            if cn and cn in nk:
                return processed_data[ok]
    # Last resort: return empty
    return pd.DataFrame()
# Try to find and return a pandas Series of datetimes from common date columns
def find_date_series(df: pd.DataFrame) -> pd.Series:
    if df is None or df.empty:
        return pd.Series(dtype='datetime64[ns]')
    # Prefer common date-like column names in likely order
    candidates = [
        'Date of Occurrence',
        'Incident Date',
        'Hazard Date',
        'Report Date',
        'Date Reported',
        'Start Date',
        'End Date',
        'Date',
        'Occurrence Date',
        'Created Date',
    ]
    for col in candidates:
        if col in df.columns:
            # Use robust coercion (handles numeric Excel serials and D/M/Y strings) to avoid warnings
            s = coerce_mixed_excel_dates(df[col])
            if s.notna().any():
                return s
    # Fallback: try first column that can be coerced to datetime with any non-na values
    for col in df.columns:
        try:
            # Robust coercion in fallback as well
            s = coerce_mixed_excel_dates(df[col])
            if s.notna().any():
                return s
        except Exception:
            continue
    return pd.Series(dtype='datetime64[ns]')

# ---------- Generic helpers for modular charts ----------
def monthly_count_from(df: pd.DataFrame, date_col: str, label: str) -> Dict[str, Any]:
    if df is None or df.empty:
        return {"labels": [], "datasets": [{"label": label, "data": []}]}
    # Prefer explicit column if available
    s = pd.Series(dtype='datetime64[ns]')
    if date_col in df.columns:
        # Robust coercion (handles numeric Excel serials and D/M/Y strings)
        s = coerce_mixed_excel_dates(df[date_col])
    # Fallback to detected date series when explicit parse fails
    if s.dropna().empty:
        s = find_date_series(df)
    s = s.dropna()
    if s.empty:
        return {"labels": [], "datasets": [{"label": label, "data": []}]}
    vc = s.dt.to_period('M').value_counts().sort_index()
    months = list(vc.index)
    return {
        "labels": [str(m) for m in months],
        "datasets": [{"label": label, "data": [safe_int(vc.get(m, 0)) for m in months]}],
    }

def quarterly_count_from(df: pd.DataFrame, date_col: str, label: str) -> Dict[str, Any]:
    if df is None or df.empty or date_col not in df.columns:
        return {"labels": [], "datasets": [{"label": label, "data": []}]}
    # Use robust coercion to avoid pandas parsing warnings and handle Excel serials
    s = coerce_mixed_excel_dates(df[date_col]).dropna()
    if s.empty:
        return {"labels": [], "datasets": [{"label": label, "data": []}]}
    vc = s.dt.to_period('Q').value_counts().sort_index()
    qs = list(vc.index)
    return {
        "labels": [str(q) for q in qs],
        "datasets": [{"label": label, "data": [safe_int(vc.get(q, 0)) for q in qs]}],
    }

def value_counts_chart(df: pd.DataFrame, col: str, label: str = "Count", top_n: int | None = None, include_others: bool = False) -> Dict[str, Any]:
    if df is None or df.empty or col not in df.columns:
        return {"labels": [], "datasets": [{"label": label, "data": []}]}
    # Clean values: trim, drop empties and common placeholders
    s = df[col].astype(str).map(lambda x: str(x).strip())
    s = s[s.str.len() > 0]
    placeholders = {"na", "n/a", "none", "-", "—", "nan"}
    s = s[~s.str.lower().isin(placeholders)]
    if s.empty:
        return {"labels": [], "datasets": [{"label": label, "data": []}]}
    vc = s.value_counts()
    if top_n is not None and top_n > 0:
        top = vc.head(top_n)
        if include_others and len(vc) > top_n:
            others = vc.iloc[top_n:].sum()
            top = pd.concat([top, pd.Series({"Others": others})])
        vc = top
    labels = list(vc.index)
    return {"labels": labels, "datasets": [{"label": label, "data": [safe_int(v) for v in vc.values]}]}

def value_counts_from_candidates(df: pd.DataFrame, cols: List[str], label: str = "Count", top_n: int | None = None, include_others: bool = False) -> Dict[str, Any]:
    if df is None or df.empty:
        return {"labels": [], "datasets": [{"label": label, "data": []}]}
    for c in cols:
        if c in df.columns:
            return value_counts_chart(df, c, label, top_n, include_others)
    return {"labels": [], "datasets": [{"label": label, "data": []}]}

def map_findings_to_parent_dates(findings_df: pd.DataFrame, parent_df: pd.DataFrame, findings_title_col: str, parent_title_col: str, parent_date_col: str) -> pd.DataFrame:
    if findings_df is None or findings_df.empty or parent_df is None or parent_df.empty:
        return pd.DataFrame(columns=["_date"])
    # Build map from parent title -> date
    parent = parent_df[[parent_title_col, parent_date_col]].copy()
    # Robust date coercion to avoid pandas warnings and handle Excel serials
    parent[parent_date_col] = coerce_mixed_excel_dates(parent[parent_date_col])
    parent = parent.dropna(subset=[parent_date_col])
    title_to_date = dict(zip(parent[parent_title_col].astype(str), parent[parent_date_col]))
    dates = findings_df[findings_title_col].astype(str).map(title_to_date)
    out = pd.DataFrame({"_date": dates})
    out["_date"] = coerce_mixed_excel_dates(out["_date"]) 
    out = out.dropna(subset=["_date"])  # rows we could map
    return out
    candidates = [
        'Date of Occurrence',
        'Incident Date',
        'Hazard Date',
        'Report Date',
        'Start Date',
        'Date',
        'Occurrence Date',
        'Created Date',
    ]
    for col in candidates:
        if col in df.columns:
            s = pd.to_datetime(df[col], errors='coerce')
            if s.notna().any():
                return s
    # Fallback: try the first datetime-like column
    for col in df.columns:
        try:
            s = pd.to_datetime(df[col], errors='coerce')
            if s.notna().any():
                return s
        except Exception:
            continue
    return pd.Series(dtype='datetime64[ns]')
# Endpoint to upload and process the Excel file
@app.post("/upload-excel")
async def upload_excel(file: UploadFile = File(...)):
    global processed_data
    global insights_kb
    contents = await file.read()
    excel_file = io.BytesIO(contents)
    processed_data = pd.read_excel(excel_file, sheet_name=None)
    
    # Preprocess dates in relevant sheets using mixed coercion (handles numbers and strings)
    for sheet_name in ['Incident', 'Hazard ID', 'Audit', 'Inspection']:
        if sheet_name in processed_data:
            df = processed_data[sheet_name]
            if 'Date of Occurrence' in df.columns:
                df['Date of Occurrence'] = coerce_mixed_excel_dates(df['Date of Occurrence'])
            if 'Date Reported' in df.columns:
                df['Date Reported'] = coerce_mixed_excel_dates(df['Date Reported'])
            if 'Start Date' in df.columns:  # For audits/inspections
                df['Start Date'] = coerce_mixed_excel_dates(df['Start Date'])
    
    # Compute insights KB for LLM after processing
    try:
        insights_kb = compute_insights(processed_data)
    except Exception:
        insights_kb = {}

    return {"message": "Excel file uploaded and processed successfully"}

# Helper functions to compute chart data dynamically
def get_entries_by_category() -> Dict[str, Any]:
    if not processed_data:
        return {"error": "No data processed. Upload Excel first."}
    
    counts = {
        "Incidents": len(get_sheet('Incident', 'Incidents', 'Incident Log')),
        "Hazards": len(get_sheet('Hazard ID', 'Hazards', 'Hazard Log')),
        "Audits": len(get_sheet('Audit', 'Audits')),
        "Audit Findings": len(get_sheet('Audit Findings', 'Audit Finding', 'Findings (Audit)')),
        "Inspections": len(get_sheet('Inspection', 'Inspections')),
        "Inspection Findings": len(get_sheet('Inspection Findings', 'Inspection Finding', 'Findings (Inspection)'))
    }
    
    return {
        "labels": list(counts.keys()),
        "datasets": [{
            "label": "Count of Entries",
            "data": [safe_int(v) for v in list(counts.values())],
            "backgroundColor": ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"]
        }]
    }

def get_incident_hazard_types() -> Dict[str, Any]:
    if not processed_data:
        return {"error": "No data processed. Upload Excel first."}
    
    types = {}
    for df in [get_sheet('Incident', 'Incidents', 'Incident Log'), get_sheet('Hazard ID', 'Hazards', 'Hazard Log')]:
        if not df.empty and 'Incident Type(s)' in df.columns:
            for t in df['Incident Type(s)'].dropna():
                for typ in str(t).split('; '):  # Split multiple types
                    types[typ] = types.get(typ, 0) + 1
    
    sorted_types = dict(sorted(types.items(), key=lambda item: item[1], reverse=True))
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2"] * (len(sorted_types) // 7 + 1)
    
    return {
        "labels": list(sorted_types.keys()),
        "datasets": [{
            "data": [safe_int(v) for v in list(sorted_types.values())],
            "backgroundColor": colors[:len(sorted_types)]
        }]
    }

def get_monthly_trends() -> Dict[str, Any]:
    if not processed_data:
        return {"error": "No data processed. Upload Excel first."}
    
    incidents = get_sheet('Incident', 'Incidents', 'Incident Log')
    hazards = get_sheet('Hazard ID', 'Hazards', 'Hazard Log')
    
    # Use best-effort detection of date columns
    inc_dates = find_date_series(incidents)
    haz_dates = find_date_series(hazards)
    
    inc_monthly = inc_dates.dropna().dt.to_period('M').value_counts().sort_index() if not inc_dates.empty else pd.Series(dtype=int)
    haz_monthly = haz_dates.dropna().dt.to_period('M').value_counts().sort_index() if not haz_dates.empty else pd.Series(dtype=int)
    
    all_months = sorted(set(inc_monthly.index) | set(haz_monthly.index))
    labels = [str(m) for m in all_months]
    
    return {
        "labels": labels,
        "datasets": [
            {"label": "Incidents", "data": [safe_int(inc_monthly.get(m, 0)) for m in all_months], "borderColor": "#1f77b4"},
            {"label": "Hazards", "data": [safe_int(haz_monthly.get(m, 0)) for m in all_months], "borderColor": "#ff7f0e"}
        ]
    }

def get_entries_by_location() -> Dict[str, Any]:
    if not processed_data:
        return {"error": "No data processed. Upload Excel first."}
    
    locations = {}
    for sheet in processed_data.values():
        if 'Location (EPCL)' in sheet.columns:
            for loc in sheet['Location (EPCL)'].dropna():
                locations[loc] = locations.get(str(loc), 0) + 1
    
    sorted_locs = dict(sorted(locations.items(), key=lambda item: item[1], reverse=True))
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22"] * (len(sorted_locs) // 9 + 1)
    
    return {
        "labels": list(sorted_locs.keys()),
        "datasets": [{
            "label": "Count of Entries",
            "data": [safe_int(v) for v in list(sorted_locs.values())],
            "backgroundColor": colors[:len(sorted_locs)]
        }]
    }

def get_stacked_entries_by_location() -> Dict[str, Any]:
    if not processed_data:
        return {"error": "No data processed. Upload Excel first."}
    
    loc_data = {}
    categories = ['Incidents', 'Hazards', 'Audits', 'Inspections']
    sheet_map = {
        'Incidents': ['Incident', 'Incidents', 'Incident Log'],
        'Hazards': ['Hazard ID', 'Hazards', 'Hazard Log'],
        'Audits': ['Audit', 'Audits'],
        'Inspections': ['Inspection', 'Inspections'],
    }
    
    all_locs = set()
    for cat, candidates in sheet_map.items():
        df = get_sheet(*candidates)
        if not df.empty and 'Location (EPCL)' in df.columns:
            loc_counts = df['Location (EPCL)'].value_counts()
            loc_data[cat] = loc_counts
            all_locs.update([str(x) for x in loc_counts.index])
    
    all_locs = list(all_locs)
    datasets = []
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]
    for i, cat in enumerate(categories):
        data = [safe_int(loc_data.get(cat, pd.Series(dtype=int)).get(loc, 0)) for loc in all_locs]
        datasets.append({"label": cat, "data": data, "backgroundColor": colors[i]})
    
    return {
        "labels": all_locs,
        "datasets": datasets
    }

def get_types_by_location() -> Dict[str, Any]:
    if not processed_data:
        return {"error": "No data processed. Upload Excel first."}
    
    loc_types = {}
    for df in [get_sheet('Incident', 'Incidents', 'Incident Log'), get_sheet('Hazard ID', 'Hazards', 'Hazard Log')]:
        if not df.empty and 'Location (EPCL)' in df.columns and 'Incident Type(s)' in df.columns:
            for _, row in df.iterrows():
                loc = row['Location (EPCL)']
                if pd.notna(loc):
                    for typ in str(row['Incident Type(s)']).split('; '):
                        if typ:
                            loc = str(loc)
                            if loc not in loc_types:
                                loc_types[loc] = {}
                            loc_types[loc][typ] = loc_types[loc].get(typ, 0) + 1
    
    all_types = set()
    for types in loc_types.values():
        all_types.update(types.keys())
    all_types = list(all_types)
    all_locs = list(loc_types.keys())
    
    datasets = []
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2"] * (len(all_types) // 7 + 1)
    for i, typ in enumerate(all_types):
        data = [safe_int(loc_types.get(loc, {}).get(typ, 0)) for loc in all_locs]
        datasets.append({"label": typ, "data": data, "backgroundColor": colors[i]})
    
    return {
        "labels": all_locs,
        "datasets": datasets
    }

def get_proportion_by_location() -> Dict[str, Any]:
    entries = get_entries_by_location()
    if "error" in entries:
        return entries
    return {
        "labels": entries["labels"],
        "datasets": entries["datasets"]
    }  # Same as entries by location for pie

def get_status_by_location() -> Dict[str, Any]:
    if not processed_data:
        return {"error": "No data processed. Upload Excel first."}
    
    loc_status = {}
    for sheet in processed_data.values():
        if 'Location (EPCL)' in sheet.columns and 'Audit Status' in sheet.columns:  # Assuming 'Audit Status' or 'Status'
            for _, row in sheet.iterrows():
                loc = row['Location (EPCL)']
                status = row.get('Audit Status') or row.get('Status')
                if pd.notna(loc) and pd.notna(status):
                    if loc not in loc_status:
                        loc_status[loc] = {}
                    loc_status[loc][status] = loc_status[loc].get(status, 0) + 1
    
    all_statuses = set()
    for statuses in loc_status.values():
        all_statuses.update(statuses.keys())
    all_statuses = list(all_statuses)
    all_locs = list(loc_status.keys())
    
    datasets = []
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]
    for i, status in enumerate(all_statuses):
        data = [safe_int(loc_status.get(loc, {}).get(status, 0)) for loc in all_locs]
        datasets.append({"label": status, "data": [safe_int(x) for x in data], "backgroundColor": colors[i % len(colors)]})
    
    return {
        "labels": all_locs,
        "datasets": datasets
    }
def get_heatmap_data() -> Dict[str, Any]:
    if not processed_data:
        return {"error": "No data processed. Upload Excel first."}
    
    # Build location -> {Incidents, Hazards}
    inc_haz: Dict[str, Dict[str, int]] = {}
    for df, cat in [
        (get_sheet('Incident', 'Incidents', 'Incident Log'), 'Incidents'),
        (get_sheet('Hazard ID', 'Hazards', 'Hazard Log'), 'Hazards'),
    ]:
        if not df.empty and 'Location (EPCL)' in df.columns:
            loc_counts = df['Location (EPCL)'].value_counts()
            for loc, count in loc_counts.items():
                loc = str(loc)
                if loc not in inc_haz:
                    inc_haz[loc] = {'Incidents': 0, 'Hazards': 0}
                inc_haz[loc][cat] = safe_int(count)

    # Sort locations by total descending
    sorted_locs = sorted(inc_haz.keys(), key=lambda l: safe_int(inc_haz[l]['Incidents']) + safe_int(inc_haz[l]['Hazards']), reverse=True)

    x_labels = ['Incidents', 'Hazards']
    y_labels = sorted_locs
    values: List[List[int]] = []
    min_v = None
    max_v = None
    for loc in y_labels:
        row = [safe_int(inc_haz[loc].get(x, 0)) for x in x_labels]
        values.append(row)
        for v in row:
            min_v = v if min_v is None else min(min_v, v)
            max_v = v if max_v is None else max(max_v, v)
    if min_v is None:
        min_v = 0
        max_v = 0

    return {
        "x_labels": x_labels,
        "y_labels": y_labels,
        "values": values,
        "min": safe_int(min_v),
        "max": safe_int(max_v),
        "title": "Incidents and Hazards by Location",
    }

# ---------- Modular domain-specific chart generators ----------
def get_incidents_types() -> Dict[str, Any]:
    df = get_sheet('Incident', 'Incidents', 'Incident Log')
    return value_counts_from_candidates(df, ['Type of Incident', 'Incident Type(s)'], 'Incidents by Type', top_n=20, include_others=True)

def get_incidents_top_locations() -> Dict[str, Any]:
    df = get_sheet('Incident', 'Incidents', 'Incident Log')
    return value_counts_from_candidates(df, ['Line', 'Department', 'Area', 'Location (EPCL)'], 'Incidents by Location', top_n=15, include_others=True)

def get_hazards_monthly() -> Dict[str, Any]:
    df = get_sheet('Hazard ID', 'Hazards', 'Hazard Log')
    # Provided header: 'Date Reported'
    if 'Date Reported' not in df.columns and 'Date of Occurrence' in df.columns:
        df = df.rename(columns={'Date of Occurrence': 'Date Reported'})
    return monthly_count_from(df, 'Date Reported', 'Hazards')

def get_hazards_by_location() -> Dict[str, Any]:
    df = get_sheet('Hazard ID', 'Hazards', 'Hazard Log')
    return value_counts_from_candidates(df, ['Line', 'Department', 'Area', 'Location (EPCL)'], 'Hazards by Location', top_n=15, include_others=True)

def get_audits_monthly() -> Dict[str, Any]:
    df = get_sheet('Audit', 'Audits')
    return monthly_count_from(df, 'Start Date', 'Audits')

def get_audits_coverage_by_area() -> Dict[str, Any]:
    df = get_sheet('Audit', 'Audits')
    # Provided header: 'Department'
    return value_counts_chart(df, 'Department', 'Audit Coverage by Department', top_n=20, include_others=True)

def get_audits_by_auditor() -> Dict[str, Any]:
    df = get_sheet('Audit', 'Audits')
    return value_counts_chart(df, 'Auditor', 'Audits by Auditor', top_n=20, include_others=True)

def get_audit_findings_common_types() -> Dict[str, Any]:
    df = get_sheet('Audit Findings', 'Audit Finding')
    # No explicit type — use Status as proxy for type/category
    return value_counts_chart(df, 'Status', 'Findings by Status')

def get_audit_findings_severity() -> Dict[str, Any]:
    df = get_sheet('Audit Findings', 'Audit Finding')
    return value_counts_chart(df, 'Severity', 'Findings by Severity')

def get_audit_findings_monthly() -> Dict[str, Any]:
    findings = get_sheet('Audit Findings', 'Audit Finding')
    audits = get_sheet('Audit', 'Audits')
    mapped = map_findings_to_parent_dates(findings, audits, 'Audit Title', 'Audit Title', 'Start Date')
    if mapped.empty:
        return {"labels": [], "datasets": [{"label": "Audit Findings", "data": []}]}
    vc = mapped['_date'].dt.to_period('M').value_counts().sort_index()
    months = list(vc.index)
    return {"labels": [str(m) for m in months], "datasets": [{"label": "Audit Findings", "data": [safe_int(vc.get(m, 0)) for m in months]}]}

def get_inspections_monthly() -> Dict[str, Any]:
    df = get_sheet('Inspection', 'Inspections')
    return monthly_count_from(df, 'Start Date', 'Inspections')

def get_inspections_by_location() -> Dict[str, Any]:
    df = get_sheet('Inspection', 'Inspections')
    # Provided header: 'Area'
    return value_counts_chart(df, 'Area', 'Inspections by Location', top_n=20, include_others=True)

def get_inspections_by_inspector() -> Dict[str, Any]:
    df = get_sheet('Inspection', 'Inspections')
    return value_counts_chart(df, 'Inspector', 'Inspections by Inspector', top_n=20, include_others=True)

def get_inspection_findings_common_issues() -> Dict[str, Any]:
    df = get_sheet('Inspection Findings', 'Inspection Finding')
    # Use Status as a proxy for issue/category
    return value_counts_chart(df, 'Status', 'Inspection Findings by Status')

def get_inspection_findings_severity() -> Dict[str, Any]:
    df = get_sheet('Inspection Findings', 'Inspection Finding')
    return value_counts_chart(df, 'Severity', 'Inspection Findings by Severity')

def get_inspection_findings_quarterly() -> Dict[str, Any]:
    findings = get_sheet('Inspection Findings', 'Inspection Finding')
    inspections = get_sheet('Inspection', 'Inspections')
    mapped = map_findings_to_parent_dates(findings, inspections, 'Inspection Title', 'Inspection Title', 'Start Date')
    if mapped.empty:
        return {"labels": [], "datasets": [{"label": "Inspection Findings", "data": []}]}
    vc = mapped['_date'].dt.to_period('Q').value_counts().sort_index()
    qs = list(vc.index)
    return {"labels": [str(q) for q in qs], "datasets": [{"label": "Inspection Findings", "data": [safe_int(vc.get(q, 0)) for q in qs]}]}

# Endpoints for each chart (same as before, but using dynamic functions)
@app.get("/chart/entries-by-category", response_model=Dict[str, Any])
def entries_by_category():
    return get_entries_by_category()

@app.get("/chart/incident-hazard-types", response_model=Dict[str, Any])
def incident_hazard_types():
    return get_incident_hazard_types()

@app.get("/chart/monthly-trends", response_model=Dict[str, Any])
def monthly_trends():
    return get_monthly_trends()

@app.get("/chart/entries-by-location", response_model=Dict[str, Any])
def entries_by_location():
    return get_entries_by_location()

@app.get("/chart/stacked-entries-by-location", response_model=Dict[str, Any])
def stacked_entries_by_location():
    return get_stacked_entries_by_location()

@app.get("/chart/types-by-location", response_model=Dict[str, Any])
def types_by_location():
    return get_types_by_location()

@app.get("/chart/proportion-by-location", response_model=Dict[str, Any])
def proportion_by_location():
    return get_proportion_by_location()

@app.get("/chart/status-by-location", response_model=Dict[str, Any])
def status_by_location():
    return get_status_by_location()

@app.get("/chart/heatmap", response_model=Dict[str, Any])
def heatmap():
    return get_heatmap_data()

# ---------- Modular endpoints ----------
@app.get("/chart/incidents/types", response_model=Dict[str, Any])
def incidents_types():
    return get_incidents_types()

@app.get("/chart/incidents/top-locations", response_model=Dict[str, Any])
def incidents_top_locations():
    return get_incidents_top_locations()

@app.get("/chart/hazards/monthly", response_model=Dict[str, Any])
def hazards_monthly():
    return get_hazards_monthly()

@app.get("/chart/hazards/by-location", response_model=Dict[str, Any])
def hazards_by_location():
    return get_hazards_by_location()

@app.get("/chart/audits/monthly", response_model=Dict[str, Any])
def audits_monthly():
    return get_audits_monthly()

@app.get("/chart/audits/coverage-by-area", response_model=Dict[str, Any])
def audits_coverage_by_area():
    return get_audits_coverage_by_area()

@app.get("/chart/audits/by-auditor", response_model=Dict[str, Any])
def audits_by_auditor():
    return get_audits_by_auditor()

@app.get("/chart/audit-findings/common-types", response_model=Dict[str, Any])
def audit_findings_common_types():
    return get_audit_findings_common_types()

@app.get("/chart/audit-findings/severity", response_model=Dict[str, Any])
def audit_findings_severity():
    return get_audit_findings_severity()

@app.get("/chart/audit-findings/monthly", response_model=Dict[str, Any])
def audit_findings_monthly():
    return get_audit_findings_monthly()

@app.get("/chart/inspections/monthly", response_model=Dict[str, Any])
def inspections_monthly():
    return get_inspections_monthly()

@app.get("/chart/inspections/by-location", response_model=Dict[str, Any])
def inspections_by_location():
    return get_inspections_by_location()

@app.get("/chart/inspections/by-inspector", response_model=Dict[str, Any])
def inspections_by_inspector():
    return get_inspections_by_inspector()

@app.get("/chart/inspection-findings/common-issues", response_model=Dict[str, Any])
def inspection_findings_common_issues():
    return get_inspection_findings_common_issues()

@app.get("/chart/inspection-findings/severity", response_model=Dict[str, Any])
def inspection_findings_severity():
    return get_inspection_findings_severity()

@app.get("/chart/inspection-findings/quarterly", response_model=Dict[str, Any])
def inspection_findings_quarterly():
    return get_inspection_findings_quarterly()

# -------------------- Simple Q&A endpoint --------------------
class QARequest(BaseModel):
    question: str
    verbose: bool | None = False

def _count_category(cat: str) -> int:
    """Return total rows for a given category name."""
    cat_n = _norm(cat)
    if 'incident' in cat_n:
        return len(get_sheet('Incident', 'Incidents', 'Incident Log'))
    if 'hazard' in cat_n:
        return len(get_sheet('Hazard ID', 'Hazards', 'Hazard Log'))
    if 'auditfinding' in cat_n or ('audit' in cat_n and 'finding' in cat_n):
        return len(get_sheet('Audit Findings', 'Audit Finding', 'Findings (Audit)'))
    if 'audit' in cat_n:
        return len(get_sheet('Audit', 'Audits'))
    if 'inspectionfinding' in cat_n or ('inspection' in cat_n and 'finding' in cat_n):
        return len(get_sheet('Inspection Findings', 'Inspection Finding', 'Findings (Inspection)'))
    if 'inspection' in cat_n:
        return len(get_sheet('Inspection', 'Inspections'))
    return 0

def _top_location_for(df: pd.DataFrame) -> str | None:
    if df is None or df.empty or 'Location (EPCL)' not in df.columns:
        return None
    vc = df['Location (EPCL)'].dropna().astype(str).value_counts()
    return vc.index[0] if not vc.empty else None

def _parse_month_year(question: str) -> tuple[int | None, int | None]:
    """Best-effort month/year extractor from free text."""
    import re
    months = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    }
    q = question.lower()
    m = None
    for name, num in months.items():
        if name in q:
            m = num
            break
    y = None
    y_match = re.search(r"\b(20\d{2}|19\d{2})\b", q)
    if y_match:
        y = int(y_match.group(1))
    return m, y

def _count_in_month(df: pd.DataFrame, month: int | None, year: int | None) -> int:
    if df is None or df.empty:
        return 0
    s = find_date_series(df)
    s = s.dropna()
    if s.empty:
        return 0
    if month is not None:
        s = s[s.dt.month == month]
    if year is not None:
        s = s[s.dt.year == year]
    return int(len(s))

@app.post("/qa")
def qa(req: QARequest):
    if not processed_data:
        return {"answer": "No data uploaded yet. Please upload an Excel file first from the dashboard.", "ok": False}

    q = req.question.strip()
    qn = _norm(q)

    # 1) Totals per category
    if any(t in qn for t in ["total", "count", "howmany", "numberof", "howmuch"]):
        # Identify category if mentioned
        for cat in ["incidents", "hazards", "audits", "audit findings", "inspections", "inspection findings"]:
            if _norm(cat[:-1]) in qn or _norm(cat) in qn:
                c = _count_category(cat)
                return {"answer": f"Total {cat.title()}: {c}", "ok": True}
        # Fallback: entries by location total
        total_entries = sum(_count_category(c) for c in ["incidents", "hazards", "audits", "inspection findings", "audit findings", "inspections"]) 
        return {"answer": f"Total entries across all categories: {total_entries}", "ok": True}

    # 2) Top locations
    if any(t in qn for t in ["toplocation", "tophotspot", "tophot", "mostcommonlocation", "toparea", "topline", "tophighestlocation"]):
        # Try per-category if mentioned
        if "incident" in qn:
            loc = _top_location_for(get_sheet('Incident', 'Incidents', 'Incident Log'))
            if loc:
                return {"answer": f"Top incident location: {loc}", "ok": True}
        if "hazard" in qn:
            loc = _top_location_for(get_sheet('Hazard ID', 'Hazards', 'Hazard Log'))
            if loc:
                return {"answer": f"Top hazard location: {loc}", "ok": True}
        # Otherwise overall across sheets
        entries = get_entries_by_location()
        if "labels" in entries and entries.get("labels"):
            return {"answer": f"Top location overall: {entries['labels'][0]}", "ok": True}
        return {"answer": "Couldn't determine top location.", "ok": False}

    # 3) Counts in a month/year for categories
    if any(t in qn for t in ["in", "during", "on"]):
        m, y = _parse_month_year(q)
        if m is not None or y is not None:
            if "incident" in qn:
                c = _count_in_month(get_sheet('Incident', 'Incidents', 'Incident Log'), m, y)
                return {"answer": f"Incidents in the specified period: {c}", "ok": True}
            if "hazard" in qn:
                c = _count_in_month(get_sheet('Hazard ID', 'Hazards', 'Hazard Log'), m, y)
                return {"answer": f"Hazards in the specified period: {c}", "ok": True}
            if "audit" in qn and "finding" not in qn:
                c = _count_in_month(get_sheet('Audit', 'Audits'), m, y)
                return {"answer": f"Audits in the specified period: {c}", "ok": True}
            if "inspection" in qn and "finding" not in qn:
                c = _count_in_month(get_sheet('Inspection', 'Inspections'), m, y)
                return {"answer": f"Inspections in the specified period: {c}", "ok": True}

    # 4) Help / fallback
    help_text = (
        "I can answer questions like: \n"
        "- Total incidents / hazards / audits / inspections\n"
        "- Top incident or hazard location\n"
        "- Incidents or hazards in March 2024 (month/year filters)\n"
        "If you need something more specific, please rephrase."
    )
    return {"answer": help_text, "ok": True}

@app.post("/qa/stream")
def qa_stream(req: QARequest):
    """Streams a natural-language answer using OpenAI, grounded on aggregated insights only."""
    if not processed_data:
        def gen1():
            yield "No data uploaded yet. Please upload an Excel file first from the dashboard."
        return StreamingResponse(gen1(), media_type="text/plain")

    # Select only a small, relevant subset of the insights to keep prompts lean
    relevant = select_relevant_insights(insights_kb or {}, req.question or "")
    verbose_mode = bool(getattr(req, 'verbose', False))
    if verbose_mode:
        # In verbose mode, allow the model to see the full aggregated KB (still no raw rows)
        relevant = insights_kb or {}

    def build_chart_payload(question: str, rel: Dict[str, Any]) -> Dict[str, Any]:
        """Build simple visualization metadata.
        Returns a dict that may include:
          - chart_data: { labels: [...], datasets: [{ label, data: [...] }] }
          - table_data: { headers: [...], rows: [[...], ...] }
          - note: string clarification about dated vs total counts
        """
        payload: Dict[str, Any] = {}
        verbose_mode = bool(getattr(req, 'verbose', False))

        # Verbose: build multiple blocks, but be intent-aware to avoid noise
        if verbose_mode:
            blocks: list[dict] = []
            qn = (question or '').lower()
            location_intent = any(w in qn for w in ['location', 'where', 'area', 'line', 'department'])
            month_intent = any(w in qn for w in ['month', 'monthly', 'trend'])

            # Location-focused blocks first
            for key, series_label in [
                ('incidents_by_location', 'Incidents by Location'),
                ('hazards_by_location', 'Hazards by Location'),
                ('incidents_by_department', 'Incidents by Department'),
                ('incidents_by_line', 'Incidents by Line'),
            ]:
                if location_intent and key in rel and isinstance(rel[key], dict) and rel[key]:
                    items = sorted(rel[key].items(), key=lambda x: (-int(x[1]), str(x[0])))[:12]
                    labels = [str(k) for k, _ in items]
                    data = [int(v) for _, v in items]
                    blocks.append({
                        'chart_data': { 'labels': labels, 'datasets': [{ 'label': series_label, 'data': data }]},
                        'table_data': { 'headers': ['Location/Category', 'Count'], 'rows': [[str(k), int(v)] for k, v in items] },
                    })

            # Monthly only if asked or if no location context was found
            if (month_intent or not blocks):
                label_map = {
                    'incidents_per_month': 'Incidents',
                    'hazards_per_month': 'Hazards',
                }
                for key, series_label in label_map.items():
                    if key in rel and isinstance(rel[key], dict) and rel[key]:
                        labels = sorted(rel[key].keys())
                        data = [int(rel[key][k]) for k in labels]
                        block: Dict[str, Any] = {
                            'chart_data': { 'labels': labels, 'datasets': [{ 'label': series_label, 'data': data }] },
                            'table_data': { 'headers': [series_label + ' Month', 'Count'], 'rows': sorted(((str(k), int(v)) for k, v in rel[key].items()), key=lambda x: -x[1])[:12] }
                        }
                        blocks.append(block)

            # If still nothing was added, fallback to any categorical overview
            if not blocks:
                for key in ['incidents_by_type','hazards_by_status']:
                    if key in rel and isinstance(rel[key], dict) and rel[key]:
                        items = sorted(rel[key].items(), key=lambda x: (-int(x[1]), str(x[0])))[:12]
                        labels = [str(k) for k, _ in items]
                        data = [int(v) for _, v in items]
                        blocks.append({
                            'chart_data': { 'labels': labels, 'datasets': [{ 'label': key.replace('_', ' ').title(), 'data': data }] },
                            'table_data': { 'headers': ['Category', 'Count'], 'rows': [[str(k), int(v)] for k, v in items] }
                        })
            if blocks:
                return { 'chart_blocks': blocks }
        # Prefer monthly trends if available
        label_map = {
            'incidents_per_month': 'Incidents',
            'hazards_per_month': 'Hazards',
            'audits_per_month': 'Audits',
            'inspections_per_month': 'Inspections',
        }
        qn = (question or "").lower()
        for key, series_label in label_map.items():
            if key in rel and isinstance(rel[key], dict) and rel[key]:
                labels = sorted(rel[key].keys())
                data = [int(rel[key][k]) for k in labels]
                # If the time series is too small, fall back later to categorical
                small_series = len(labels) < 3

                payload['chart_data'] = {
                    'labels': labels,
                    'datasets': [{ 'label': series_label, 'data': data }]
                }
                # Also build a small table with top months by count
                pairs = sorted(((str(k), int(v)) for k, v in rel[key].items()), key=lambda x: -x[1])[:12]
                payload['table_data'] = {
                    'headers': [series_label + ' Month', 'Count'],
                    'rows': [[k, v] for k, v in pairs]
                }
                # Add note if we have totals vs dated totals
                totals_key = {
                    'Incidents': ('incidents_total', 'incidents_total_dated'),
                    'Hazards': ('hazards_total', 'hazards_total_dated'),
                    'Audits': ('audits_total', 'audits_total_dated'),
                    'Inspections': ('inspections_total', 'inspections_total_dated'),
                }.get(series_label)
                if totals_key:
                    t_all = rel.get(totals_key[0])
                    t_dated = rel.get(totals_key[1])
                    if isinstance(t_all, int) and isinstance(t_dated, int) and t_all >= t_dated:
                        payload['note'] = f"Showing monthly series for {t_dated} dated out of {t_all} total."

                        # If question is about totals, build an explicit Total vs Dated summary
                        if 'total' in qn or 'overall' in qn or 'count' in qn:
                            payload = {
                                'chart_data': {
                                    'labels': ['Total', 'Dated with Month'],
                                    'datasets': [{ 'label': series_label, 'data': [t_all, t_dated] }]
                                },
                                'table_data': {
                                    'headers': ['Metric', 'Count'],
                                    'rows': [['Total', t_all], ['Dated with Month', t_dated]]
                                },
                                'note': f"Total includes rows without a valid date; dated count is what appears in monthly charts."
                            }
                            return payload

                # If series too small, clear and let categorical branch pick something richer
                if small_series:
                    payload = {}
                    break
                if not verbose_mode:
                    return payload
                # In verbose mode, also include categorical top breakdown if present
                blocks: list[dict] = []
                blocks.append(dict(payload))
                for cat_key in ['incidents_by_type','hazards_by_risk','hazards_by_status','audits_by_department','inspections_by_area']:
                    if cat_key in rel and isinstance(rel[cat_key], dict) and rel[cat_key]:
                        items = sorted(rel[cat_key].items(), key=lambda x: (-int(x[1]), str(x[0])))[:12]
                        labels = [str(k) for k, _ in items]
                        data = [int(v) for _, v in items]
                        blocks.append({
                            'chart_data': { 'labels': labels, 'datasets': [{ 'label': cat_key.replace('_',' ').title(), 'data': data }]},
                            'table_data': { 'headers': ['Category', 'Count'], 'rows': [[str(k), int(v)] for k, v in items] }
                        })
                return { 'note': payload.get('note'), 'chart_blocks': blocks }
        # Otherwise pick any categorical distribution
        def headers_for_key(k: str) -> list[str]:
            mapping = {
                'incidents_by_line': ['Line', 'Incident Count'],
                'incidents_by_department': ['Department', 'Incident Count'],
                'incidents_by_type': ['Incident Type', 'Incident Count'],
                'hazards_by_risk': ['Risk Level', 'Hazard Count'],
                'hazards_by_status': ['Status', 'Hazard Count'],
                'hazards_by_line': ['Line', 'Hazard Count'],
                'audits_by_department': ['Department', 'Audit Count'],
                'audits_by_status': ['Status', 'Audit Count'],
                'inspections_by_area': ['Area', 'Inspection Count'],
                'inspections_by_department': ['Department', 'Inspection Count'],
                'inspections_by_status': ['Status', 'Inspection Count'],
                'audit_findings_by_severity': ['Severity', 'Finding Count'],
                'audit_findings_by_status': ['Status', 'Finding Count'],
                'inspection_findings_by_severity': ['Severity', 'Finding Count'],
                'inspection_findings_status': ['Status', 'Finding Count'],
            }
            return mapping.get(k, ['Category', 'Count'])
        for key in ['incidents_by_line','incidents_by_department','incidents_by_type','hazards_by_risk','hazards_by_status','hazards_by_line','audits_by_department','audits_by_status','inspections_by_area','inspections_by_department','inspections_by_status','audit_findings_by_severity','audit_findings_by_status','inspection_findings_by_severity','inspection_findings_status']:
            if key in rel and isinstance(rel[key], dict) and rel[key]:
                items = sorted(rel[key].items(), key=lambda x: (-int(x[1]), str(x[0])))[:15]
                labels = [str(k) for k, _ in items]
                data = [int(v) for _, v in items]
                if not verbose_mode:
                    payload['chart_data'] = {
                        'labels': labels,
                        'datasets': [{ 'label': key.replace('_', ' ').title(), 'data': data }]
                    }
                    payload['table_data'] = {
                        'headers': headers_for_key(key),
                        'rows': [[str(k), int(v)] for k, v in items]
                    }
                    return payload
                # verbose: include multiple categorical blocks if available
                blocks: list[dict] = []
                blocks.append({
                    'chart_data': { 'labels': labels, 'datasets': [{ 'label': key.replace('_',' ').title(), 'data': data }]},
                    'table_data': { 'headers': headers_for_key(key), 'rows': [[str(k), int(v)] for k, v in items] }
                })
                for extra in ['incidents_by_type','hazards_by_status','audits_by_status','inspections_by_status']:
                    if extra in rel and isinstance(rel[extra], dict) and rel[extra]:
                        eitems = sorted(rel[extra].items(), key=lambda x: (-int(x[1]), str(x[0])))[:12]
                        elabels = [str(k) for k, _ in eitems]
                        edata = [int(v) for _, v in eitems]
                        blocks.append({
                            'chart_data': { 'labels': elabels, 'datasets': [{ 'label': extra.replace('_',' ').title(), 'data': edata }]},
                            'table_data': { 'headers': headers_for_key(extra), 'rows': [[str(k), int(v)] for k, v in eitems] }
                        })
                return { 'chart_blocks': blocks }
        return payload

    def generator():
        # Stream text first
        for chunk in stream_answer(req.question or "", relevant, None, bool(getattr(req, 'verbose', False))):
            yield chunk
        # Then append structured metadata as a final marker
        meta = build_chart_payload(req.question or "", relevant)
        if meta:
            yield "\n[[META]]" + json.dumps(meta)

    return StreamingResponse(generator(), media_type="text/plain")

class ChartInsightsRequest(BaseModel):
    chart_key: str
    question: str | None = None
    verbose: bool | None = True

def _build_chart_question(chart_key: str, title_hint: str | None = None) -> str:
    ck = (chart_key or "").lower()
    name = title_hint or chart_key
    # Map common chart keys to intent-rich questions so selector picks good insight keys
    if ck in {"incidents_types", "incident_types"}:
        return f"Provide insights on incident types distribution, top categories, trends, and actionable recommendations. {name}"
    if ck in {"incidents_top_locations", "entries_by_location_incidents"}:
        return f"Incident hotspots by location: which areas show the highest counts and what actions should be prioritized? {name}"
    if ck in {"entries_by_category"}:
        return "Overall distribution across incidents, hazards, audits, inspections. Call out imbalances and prescribe actions."
    if ck in {"incident_hazard_types"}:
        return "Compare incidents and hazards by type; highlight dominant categories and give targeted recommendations."
    if ck in {"hazards_monthly"}:
        return "Hazard monthly trend: peaks, recent movement, seasonal patterns; give preventive recommendations."
    if ck in {"hazards_by_location"}:
        return "Hazard hotspots by location; identify top areas and propose mitigations and follow-ups."
    if ck in {"hazards_by_risk"}:
        return "Hazards by risk level; emphasize high-risk shares and prescribe controls and escalation."
    if ck in {"hazards_by_area"}:
        return "Hazards by area/department; call out problem areas and recommend targeted interventions."
    if ck in {"hazards_heatmap"}:
        return "Hazard heatmap (location × type): identify concentrated combinations and suggest focused countermeasures."
    if ck in {"hazards_vs_incidents_dept"}:
        return "Compare hazards vs incidents by department; note gaps and recommend actions per department."
    if ck in {"monthly_trends"}:
        return "Incidents and hazards monthly trends together; discuss peaks and trend direction; suggest preventive actions."
    if ck in {"entries_by_location"}:
        return "All entries by location overall; highlight top sites and propose resource allocation."
    if ck in {"stacked_entries_by_location"}:
        return "Location analysis stacked across categories (incidents, hazards, audits, inspections); recommend location-specific plans."
    if ck in {"types_by_location"}:
        return "Types by location grouped; identify notable pairings and give localized recommendations."
    if ck in {"proportion_by_location"}:
        return "Proportion analysis by location; call out high shares and propose balancing actions."
    if ck in {"status_by_location"}:
        return "Status distribution by location for audits/inspections; identify stuck statuses and recommend next steps."
    if ck in {"heatmap"}:
        return "Incidents and hazards by location heatmap; highlight top clusters and advise interventions."
    # Defaults
    return f"Provide concise, prescriptive insights and recommendations for: {name or chart_key}."

@app.post("/chart/insights/stream")
def chart_insights_stream(req: ChartInsightsRequest):
    """Streams chart-specific AI insights using only aggregated KB (no raw rows)."""
    if not processed_data:
        def gen1():
            yield "No data uploaded yet. Please upload an Excel file first from the dashboard."
        return StreamingResponse(gen1(), media_type="text/plain")

    # Build an intent-rich question from the chart key, with prescriptive focus
    auto_q = _build_chart_question(req.chart_key or "", req.question)
    q_text = (req.question or "").strip()
    if not q_text:
        q_text = auto_q
    else:
        q_text = f"{q_text}\n\nFocus on prescriptive, actionable recommendations."

    # Use selector to keep prompt lean and relevant
    relevant = select_relevant_insights(insights_kb or {}, q_text)
    verbose_mode = bool(getattr(req, 'verbose', True))
    if verbose_mode and insights_kb:
        # In verbose mode, allow the model to see the full aggregated KB (still no raw rows)
        relevant = insights_kb

    def build_chart_payload(question: str, rel: Dict[str, Any]) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}
        qn = (question or "").lower()
        # Prefer monthly series if intent suggests trends
        label_map = {
            'incidents_per_month': 'Incidents',
            'hazards_per_month': 'Hazards',
            'audits_per_month': 'Audits',
            'inspections_per_month': 'Inspections',
        }
        for key, series_label in label_map.items():
            if key in rel and isinstance(rel[key], dict) and rel[key]:
                labels = sorted(rel[key].keys())
                data = [int(rel[key][k]) for k in labels]
                payload['chart_data'] = { 'labels': labels, 'datasets': [{ 'label': series_label, 'data': data }] }
                payload['table_data'] = { 'headers': [series_label + ' Month', 'Count'], 'rows': [[str(k), int(rel[key][k])] for k in labels] }
                break
        if payload:
            return payload
        # Else pick any categorical distribution
        for key in [
            'incidents_by_location','incidents_by_line','incidents_by_department','incidents_by_type',
            'hazards_by_location','hazards_by_line','hazards_by_status','hazards_by_risk',
            'audits_by_department','audits_by_status',
            'inspections_by_area','inspections_by_department','inspections_by_status',
            'audit_findings_by_severity','audit_findings_by_status',
            'inspection_findings_by_severity','inspection_findings_status']:
            if key in rel and isinstance(rel[key], dict) and rel[key]:
                items = sorted(rel[key].items(), key=lambda x: (-int(x[1]), str(x[0])))[:15]
                payload['chart_data'] = { 'labels': [str(k) for k, _ in items], 'datasets': [{ 'label': key.replace('_',' ').title(), 'data': [int(v) for _, v in items] }] }
                payload['table_data'] = { 'headers': ['Category','Count'], 'rows': [[str(k), int(v)] for k, v in items] }
                return payload
        return payload

    def generator():
        # Stream text first
        for chunk in stream_answer(q_text, relevant, None, verbose_mode):
            yield chunk
        # Then append structured metadata block, if any
        meta = build_chart_payload(q_text, relevant)
        if meta:
            yield "\n[[META]]" + json.dumps(meta)

    return StreamingResponse(generator(), media_type="text/plain")

@app.post("/insights/recompute")
def recompute_insights():
    """Recompute insights from current processed_data without re-uploading."""
    global insights_kb
    if not processed_data:
        return {"ok": False, "message": "No data loaded. Upload an Excel file first."}
    try:
        insights_kb = compute_insights(processed_data)
        return {"ok": True, "message": "Insights recomputed."}
    except Exception as e:
        return {"ok": False, "message": f"Failed to recompute: {e}"}

# Root endpoint
@app.get("/")
def root():
    return {
        "message": "Welcome to EPCL VEHS Data API. Upload Excel via /upload-excel first.",
        "endpoints": [
            "/chart/entries-by-category",
            "/chart/incident-hazard-types",
            "/chart/monthly-trends",
            "/chart/entries-by-location",
            "/chart/stacked-entries-by-location",
            "/chart/types-by-location",
            "/chart/proportion-by-location",
            "/chart/status-by-location",
            "/chart/heatmap"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)