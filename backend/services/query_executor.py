from __future__ import annotations

import re
import time
from typing import Any, Dict, List

import psycopg

from .database_config import DatabaseConfigService


class QueryExecutor:
    _instance: QueryExecutor | None = None

    def __init__(self) -> None:
        pass

    @classmethod
    def get_instance(cls) -> QueryExecutor:
        if cls._instance is None:
            cls._instance = QueryExecutor()
        return cls._instance

    async def execute_query(self, sql_query: str, user_id: str) -> Dict[str, Any]:
        start = time.time()
        db_service = DatabaseConfigService.get_instance()
        current = db_service.get_current_connection(user_id)
        if not current:
            raise ValueError("No active database connection")

        # Sanitize SQL: allow only SELECT
        sanitized = sql_query.strip()
        # strip markdown code fences
        if sanitized.startswith("```"):
            sanitized = re.sub(r"^```(?:sql)?\s*|\s*```$", "", sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r"\s+", " ", sanitized)
        if not sanitized.lower().startswith("select"):
            raise ValueError("Only SELECT queries are allowed for security reasons.")

        requires_ssl = any(
            host in current.get("host", "")
            for host in ["neon.tech", "supabase.", "amazonaws.com", "planetscale.", "railway."]
        )
        conninfo = psycopg.conninfo.make_conninfo(
            host=current.get("host"),
            port=current.get("port"),
            dbname=current.get("database"),
            user=current.get("username"),
            password=current.get("password"),
            sslmode="require" if requires_ssl else "disable",
        )

        async with await psycopg.AsyncConnection.connect(conninfo) as aconn:
            async with aconn.cursor() as cur:
                await cur.execute(sanitized)
                rows = [dict(zip([col.name for col in cur.description], r)) for r in await cur.fetchall()]

        # Clean nulls and build columns
        cleaned_rows: List[Dict[str, Any]] = []
        for row in rows:
            new_row: Dict[str, Any] = {}
            for key, value in row.items():
                if value is None:
                    if "avg" in key.lower() or "average" in key.lower():
                        new_row[key] = None
                    else:
                        new_row[key] = 0
                else:
                    new_row[key] = value
            cleaned_rows.append(new_row)

        columns = list(rows[0].keys()) if rows else []
        chart = self._generate_chart_data(cleaned_rows, columns)

        execution_time = time.time() - start
        return {
            "table_data": cleaned_rows,
            "chart_data": chart,
            "columns": columns,
            "row_count": len(cleaned_rows),
            "execution_time": round(execution_time, 3),
        }

    def _generate_chart_data(self, rows: List[Dict[str, Any]], columns: List[str]) -> Dict[str, Any]:
        if not rows or not columns:
            return {"type": "bar", "data": [], "xAxis": "", "yAxis": ""}

        def is_number(v: Any) -> bool:
            if isinstance(v, (int, float)):
                return True
            try:
                float(v)
                return True
            except Exception:
                return False

        numeric_cols = [c for c in columns if is_number(rows[0].get(c))]
        text_cols = [c for c in columns if isinstance(rows[0].get(c), str) and not is_number(rows[0].get(c))]
        date_cols = [
            c
            for c in columns
            if isinstance(rows[0].get(c), (str,))
            and _is_date_like(rows[0].get(c))
        ]

        chart_type = "bar"
        x_axis = columns[0]
        y_axis = columns[1] if len(columns) > 1 else columns[0]

        if date_cols and numeric_cols:
            chart_type = "line"
            x_axis = date_cols[0]
            y_axis = numeric_cols[0]
        elif text_cols and numeric_cols:
            chart_type = "bar"
            x_axis = text_cols[0]
            y_axis = numeric_cols[0]
        elif len(rows) <= 10 and text_cols and numeric_cols:
            chart_type = "pie"
            x_axis = text_cols[0]
            y_axis = numeric_cols[0]

        chart_data: List[Dict[str, Any]] = []
        for row in rows:
            processed: Dict[str, Any] = {}
            for key, value in row.items():
                if key in numeric_cols and isinstance(value, str):
                    try:
                        processed[key] = float(value)
                    except Exception:
                        processed[key] = value
                else:
                    processed[key] = value
            chart_data.append(processed)

        return {"type": chart_type, "data": chart_data, "xAxis": x_axis, "yAxis": y_axis}


def _is_date_like(s: Any) -> bool:
    try:
        import dateutil.parser  # type: ignore
        dateutil.parser.parse(str(s))
        return True
    except Exception:
        try:
            import datetime as _dt
            _dt.datetime.fromisoformat(str(s))
            return True
        except Exception:
            return False


