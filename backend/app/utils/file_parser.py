import io
from typing import BinaryIO
import pandas as pd

# Map common column name variations to our standard names
COLUMN_MAPPINGS = {
    "ticker": ["ticker", "symbol", "stock", "stock_symbol", "security"],
    "shares": ["shares", "quantity", "qty", "units", "amount"],
    "cost_basis": [
        "cost_basis",
        "cost",
        "purchase_price",
        "avg_cost",
        "average_cost",
        "price_paid",
        "buy_price",
    ],
    "asset_type": ["asset_type", "type", "asset_class", "category", "security_type"],
    "notes": ["notes", "note", "comments", "description"],
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Map various column name formats to standard names."""
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    rename_map = {}
    for standard_name, variations in COLUMN_MAPPINGS.items():
        for col in df.columns:
            if col in variations and standard_name not in df.columns:
                rename_map[col] = standard_name
                break

    return df.rename(columns=rename_map)


def parse_portfolio_file(file: BinaryIO, filename: str) -> list[dict]:
    """Parse a CSV or Excel file into a list of holding dicts.

    Expected columns (flexible naming):
        - ticker/symbol (required)
        - shares/quantity (required)
        - cost_basis/purchase_price (optional)
        - asset_type/type (optional, defaults to 'equity')
        - notes (optional)

    Returns list of dicts with keys: ticker, shares, cost_basis, asset_type, notes
    """
    content = file.read()
    buffer = io.BytesIO(content)

    if filename.endswith((".xlsx", ".xls")):
        df = pd.read_excel(buffer)
    else:
        df = pd.read_csv(buffer)

    df = _normalize_columns(df)

    if "ticker" not in df.columns:
        raise ValueError(
            "File must contain a 'ticker' or 'symbol' column. "
            f"Found columns: {list(df.columns)}"
        )
    if "shares" not in df.columns:
        raise ValueError(
            "File must contain a 'shares' or 'quantity' column. "
            f"Found columns: {list(df.columns)}"
        )

    holdings = []
    for _, row in df.iterrows():
        ticker = str(row["ticker"]).strip().upper()
        if not ticker or ticker == "NAN":
            continue

        holding = {
            "ticker": ticker,
            "shares": float(row["shares"]),
            "cost_basis": (
                float(row["cost_basis"])
                if "cost_basis" in df.columns and pd.notna(row.get("cost_basis"))
                else None
            ),
            "asset_type": (
                str(row.get("asset_type", "equity")).strip().lower()
                if "asset_type" in df.columns and pd.notna(row.get("asset_type"))
                else "equity"
            ),
            "notes": (
                str(row["notes"]).strip()
                if "notes" in df.columns and pd.notna(row.get("notes"))
                else None
            ),
        }
        holdings.append(holding)

    if not holdings:
        raise ValueError("No valid holdings found in file")

    return holdings
