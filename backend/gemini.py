"""
Google Gemini AI integration for KPI suggestions and SQL generation
"""

import os
import json
import logging
from typing import List, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from backend.models import KPISuggestion

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY", "")
        self.llm = None
        if self.api_key:
            try:
                self.llm = ChatGoogleGenerativeAI(
                    model="gemini-2.5-pro",
                    google_api_key=self.api_key,
                    temperature=0.1
                )
                logger.info("Gemini AI service initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini AI: {str(e)}")
                self.llm = None
        else:
            logger.warning("GOOGLE_API_KEY not found, using fallback mode")
    
    async def generate_sql_from_query(self, query: str, schema: Dict[str, Any], sector: str) -> str:
        """Generate SQL query from natural language using Gemini AI"""
        if not self.llm:
            raise Exception("Gemini AI not available")
        
        schema_text = json.dumps(schema, indent=2)
        
        system_prompt = f"""You are an expert SQL query generator for a {sector} sector database.

Generate safe, efficient SQL queries based on natural language requests.

Rules:
1. ONLY generate SELECT statements
2. Use proper PostgreSQL syntax
3. Include COALESCE for null handling: COALESCE(column, 0) or COALESCE(column, 'Unknown')
4. Use NULLIF to prevent division by zero: NULLIF(denominator, 0)
5. Add appropriate GROUP BY, ORDER BY, and LIMIT clauses
6. Return only the SQL query, no explanation
7. Ensure all aggregations are safe and handle null values

Database Schema:
{schema_text}

Respond with only the SQL query, no markdown formatting."""

        try:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"Generate SQL for: {query}")
            ]
            
            response = await self.llm.ainvoke(messages)
            sql_query = str(response.content).strip()
            
            # Clean up any markdown formatting
            sql_query = sql_query.replace('```sql', '').replace('```', '').strip()
            
            logger.info(f"Generated SQL: {sql_query}")
            
            # Check if response is empty or invalid
            if not sql_query or sql_query == "" or sql_query.lower() in ["none", "null", "empty"]:
                logger.warning("Empty or invalid SQL response from Gemini AI")
                raise Exception("Empty SQL response from AI")
            
            return sql_query
            
        except Exception as e:
            logger.error(f"SQL generation error: {str(e)}")
            raise e

async def generate_kpi_suggestions(schema: Dict[str, Any], sector: str) -> List[KPISuggestion]:
    """Generate KPI suggestions based on database schema"""
    service = GeminiService()
    
    if not service.llm:
        return get_fallback_kpi_suggestions(sector)
    
    try:
        schema_text = json.dumps(schema, indent=2)
        
        system_prompt = f"""You are an expert data analyst who generates KPI suggestions for {sector} businesses.

Analyze the database schema and suggest exactly 5 relevant KPIs.

Rules:
1. Generate exactly 5 KPI suggestions
2. Focus on measurable business metrics
3. Consider totals, counts, averages, trends, and ratios
4. Make suggestions specific to available data
5. Include natural language query templates

Respond with JSON array in this exact format:
[
  {{
    "id": "unique_kpi_id",
    "name": "Human-readable KPI Name",
    "description": "What this KPI measures and why it's useful",
    "query_template": "Natural language question a user would ask",
    "category": "Category name"
  }}
]"""

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Database Schema for {sector} business:\n{schema_text}")
        ]
        
        response = await service.llm.ainvoke(messages)
        raw_json = str(response.content).strip()
        
        # Clean up markdown formatting
        raw_json = raw_json.replace('```json', '').replace('```', '').strip()
        
        logger.info(f"Generated KPI suggestions: {raw_json}")
        
        if not raw_json or raw_json == "":
            logger.warning("Empty response from Gemini AI, using fallback")
            return get_fallback_kpi_suggestions(sector)
        
        try:
            suggestions_data = json.loads(raw_json)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse KPI suggestions JSON: {e}")
            return get_fallback_kpi_suggestions(sector)
        
        # Convert to KPISuggestion objects
        suggestions = []
        for item in suggestions_data[:5]:  # Limit to 5
            if all(key in item for key in ['id', 'name', 'description', 'query_template', 'category']):
                suggestions.append(KPISuggestion(**item))
        
        return suggestions if suggestions else get_fallback_kpi_suggestions(sector)
        
    except Exception as e:
        logger.error(f"KPI suggestions generation error: {str(e)}")
        return get_fallback_kpi_suggestions(sector)

def get_fallback_kpi_suggestions(sector: str) -> List[KPISuggestion]:
    """Fallback KPI suggestions when AI is unavailable"""
    
    if sector == "bank":
        return [
            KPISuggestion(
                id="loan_portfolio_breakdown",
                name="Loan Portfolio Breakdown",
                description="Distribution of loans by type to understand product mix",
                query_template="Show me the breakdown of loans by type",
                category="Portfolio Analysis"
            ),
            KPISuggestion(
                id="monthly_payment_collection",
                name="Monthly Payment Collection",
                description="Track monthly payment collections to monitor cash flow",
                query_template="Show me the monthly payment collections for the last 12 months",
                category="Cash Flow"
            ),
            KPISuggestion(
                id="total_loan_metrics",
                name="Total Loan Portfolio Metrics",
                description="Overall loan portfolio size and average loan amounts",
                query_template="What is the total value and average amount of all loans?",
                category="Portfolio Overview"
            ),
            KPISuggestion(
                id="customer_loan_activity",
                name="Customer Loan Activity",
                description="Number of active customers and their loan activity",
                query_template="How many customers have active loans?",
                category="Customer Analysis"
            ),
            KPISuggestion(
                id="loan_status_distribution",
                name="Loan Status Distribution",
                description="Distribution of loans by current status",
                query_template="What is the status breakdown of all loans?",
                category="Risk Management"
            )
        ]
    
    elif sector == "ithr":
        return [
            KPISuggestion(
                id="employee_department_distribution",
                name="Employee Department Distribution",
                description="Employee count by department for workforce planning",
                query_template="Show me employee distribution by department",
                category="Workforce Analytics"
            ),
            KPISuggestion(
                id="average_employee_salary",
                name="Average Salary by Department",
                description="Average salary analysis by department",
                query_template="What is the average salary by department?",
                category="Compensation"
            ),
            KPISuggestion(
                id="employee_tenure_analysis",
                name="Employee Tenure Analysis",
                description="Average employee tenure and retention metrics",
                query_template="What is the average employee tenure?",
                category="Retention"
            ),
            KPISuggestion(
                id="headcount_trends",
                name="Headcount Growth Trends",
                description="Employee headcount changes over time",
                query_template="Show me headcount trends over the last year",
                category="Growth Analytics"
            ),
            KPISuggestion(
                id="position_level_analysis",
                name="Position Level Analysis",
                description="Distribution of employees by position level",
                query_template="What is the distribution of position levels?",
                category="Organizational Structure"
            )
        ]
    
    return []