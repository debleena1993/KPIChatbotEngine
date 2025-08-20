from __future__ import annotations

import json
import os
from typing import Any, Dict, List

import google.generativeai as genai


genai.configure(api_key=os.getenv("GOOGLE_API_KEY", ""))


async def generate_kpi_suggestions(schema: Dict[str, Any], sector: str) -> List[Dict[str, Any]]:
    try:
        model = genai.GenerativeModel("gemini-2.0-flash-exp")
        system_prompt = (
            "You are an expert data analyst who generates KPI (Key Performance Indicator) suggestions based on database schemas.\n"
            "Rules:\n"
            "1. Generate exactly 5 practical KPI suggestions\n"
            "2. Focus on measurable business metrics relevant to the sector\n"
            "3. Consider totals, counts, averages, trends, ratios\n"
            "4. Include natural language query templates users can ask\n"
            "5. Categorize KPIs (Financial, Operational, Customer, Performance)\n"
            "Respond with JSON array of objects with id, name, description, query_template, category."
        )
        prompt = f"Business Sector: {sector}\n\nDatabase Schema:\n{json.dumps(schema, indent=2)}\n\nGenerate the 5 KPI suggestions now."
        resp = await model.generate_content_async([system_prompt, prompt])
        text = resp.text or ""
        suggestions = json.loads(text)
        cleaned = [
            s
            for s in suggestions
            if s.get("id") and s.get("name") and s.get("description") and s.get("query_template") and s.get("category")
        ][:5]
        if cleaned:
            return cleaned
        return _fallback_suggestions(sector)
    except Exception as e:
        print("Failed to generate KPI suggestions:", e)
        return _fallback_suggestions(sector)


def _fallback_suggestions(sector: str) -> List[Dict[str, Any]]:
    fallback = {
        "bank": [
            {"id": "total_loan_portfolio", "name": "Total Loan Portfolio Value", "description": "Sum of all loan amounts currently in the system", "query_template": "What is the total value of all loans in our portfolio?", "category": "Financial"},
            {"id": "loan_by_type_breakdown", "name": "Loan Portfolio by Type", "description": "Distribution of loan amounts by loan type", "query_template": "Show me the breakdown of loans by type", "category": "Portfolio"},
            {"id": "monthly_payment_collections", "name": "Monthly Payment Collections", "description": "Total payments received each month over the last year", "query_template": "Show me the monthly payment collection trends", "category": "Financial"},
            {"id": "customer_loan_analysis", "name": "Customer Loan Statistics", "description": "Number of customers with active loans", "query_template": "How many customers have loans with us?", "category": "Customer"},
            {"id": "loan_status_distribution", "name": "Loan Status Overview", "description": "Distribution of loans by their current status", "query_template": "What is the status breakdown of all loans?", "category": "Operations"},
        ],
        "ithr": [
            {"id": "employee_turnover", "name": "Employee Turnover Rate", "description": "Employee turnover rate by department", "query_template": "What is the employee turnover rate by department?", "category": "HR Metrics"},
            {"id": "hiring_metrics", "name": "Hiring Efficiency", "description": "Time to hire and hiring success rates", "query_template": "Show me average time to hire by position level", "category": "HR Metrics"},
            {"id": "performance_ratings", "name": "Performance Ratings", "description": "Employee performance rating distributions", "query_template": "What are the performance rating trends?", "category": "Performance"},
            {"id": "employee_headcount", "name": "Employee Headcount", "description": "Total number of employees by department", "query_template": "How many employees do we have in each department?", "category": "Workforce"},
            {"id": "average_salary", "name": "Average Salary Analysis", "description": "Average salary by department and position", "query_template": "What is the average salary by department?", "category": "Compensation"},
        ],
    }
    return fallback.get(sector) or fallback["ithr"]


async def generate_sql_from_query(nl_query: str, schema: Dict[str, Any], sector: str) -> str:
    try:
        model = genai.GenerativeModel("gemini-2.0-flash-exp")
        system_prompt = (
            f"You are an expert SQL generator for {sector} business data analysis.\n"
            "Rules:\n"
            "1. Generate safe, read-only SELECT queries only\n"
            "2. Use proper PostgreSQL syntax\n"
            "3. Include appropriate WHERE clauses for filtering\n"
            "4. Use aggregate functions when appropriate (COUNT, SUM, AVG, etc.)\n"
            "5. Add ORDER BY and LIMIT when helpful\n"
            "6. Return ONLY the SQL query with no markdown, no code blocks, start directly with SELECT\n"
            "7. Use NULLIF to prevent division by zero in ratios\n"
        )
        prompt = (
            f"Schema:\n{json.dumps(schema, indent=2)}\n\nGenerate SQL for: {nl_query}\n"
            "Return ONLY the SQL query starting with SELECT."
        )
        resp = await model.generate_content_async([system_prompt, prompt])
        raw = (resp.text or "").strip()
        if "```" in raw:
            import re as _re
            m = _re.search(r"```(?:sql)?\s*(SELECT[\s\S]*?)\s*```", raw, flags=_re.I)
            if m:
                raw = m.group(1).strip()
        # Ensure starts with SELECT
        idx = raw.upper().find("SELECT")
        if idx > 0:
            raw = raw[idx:]
        return " ".join(raw.split())
    except Exception as e:
        print("Failed to generate SQL from query:", e)
        return _fallback_sql(nl_query, schema)


def _fallback_sql(query: str, schema: Dict[str, Any]) -> str:
    lower = query.lower()
    tables = list((schema.get("tables") or {}).keys())
    if not tables:
        return "SELECT 1;"
    if "loans" in tables and "total" in lower and "loan" in lower:
        return "SELECT SUM(COALESCE(loan_amount,0)) AS total_loan_amount, COUNT(*) AS total_loans FROM loans WHERE loan_amount IS NOT NULL;"
    first = tables[0]
    cols = list(((schema.get("tables") or {}).get(first, {}).get("columns") or {}).keys())[:5]
    column_list = ", ".join(cols) if cols else "*"
    return f"SELECT {column_list} FROM {first} LIMIT 10;"


