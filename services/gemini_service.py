"""
Google Gemini AI Service
Handles AI-powered KPI suggestions and SQL generation
"""

import os
import logging
import re
from typing import Dict, Any, List
from typing_extensions import Annotated, TypedDict

logger = logging.getLogger(__name__)

try:
    import google.generativeai as genai
    AI_IMPORTS_AVAILABLE = True
    print("✓ Google Generative AI imported successfully")
    
    class State(TypedDict):
        """State for AI processing"""
        messages: list
        chart_recommendation: str
        data_insights: str
        
except ImportError as e:
    AI_IMPORTS_AVAILABLE = False
    print(f"AI dependencies not available, using fallback mode: {e}")
    
    class State(TypedDict):
        """Fallback state for when AI is not available"""
        messages: list
        chart_recommendation: str
        data_insights: str

class GeminiService:
    """Google Gemini AI service for KPI analysis"""
    
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY")
        self.ai_available = False
        
        if AI_IMPORTS_AVAILABLE and self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel('gemini-pro')
                self.ai_available = True
                logger.info("Google Gemini AI service initialized successfully")
                print("✓ Google Gemini AI service configured with API key")
            except Exception as e:
                logger.warning(f"Failed to initialize AI service: {e}")
        else:
            logger.warning("Google API key not found or AI imports unavailable, using fallback mode")
    
    async def generate_kpi_suggestions(self, schema: Dict[str, Any], sector: str) -> List[str]:
        """Generate KPI suggestions based on database schema and sector"""
        if not self.ai_available:
            return self._generate_fallback_kpi_suggestions(sector)
        
        try:
            # Create schema description
            schema_desc = self._format_schema_for_ai(schema)
            
            prompt = f"""
            You are an expert data analyst for the {sector} sector. Based on the following database schema, suggest exactly 5 relevant KPI queries that would be valuable for {sector} sector analysis.

            Database Schema:
            {schema_desc}

            Please provide exactly 5 KPI suggestions as simple, business-friendly queries (not SQL). Each suggestion should be on a new line and be actionable for the {sector} sector.

            Examples for reference:
            - What is the average salary by department?
            - How many transactions were processed this month?
            - Which department has the highest employee count?

            Provide exactly 5 suggestions:
            """
            
            response = self.model.generate_content(prompt)
            suggestions = self._parse_kpi_suggestions(response.text)
            
            # Ensure we have exactly 5 suggestions
            if len(suggestions) < 5:
                fallback = self._generate_fallback_kpi_suggestions(sector)
                suggestions.extend(fallback[len(suggestions):])
            
            return suggestions[:5]
            
        except Exception as e:
            logger.error(f"AI KPI generation failed: {e}")
            return self._generate_fallback_kpi_suggestions(sector)
    
    async def generate_sql_from_query(self, query: str, schema: Dict[str, Any], sector: str) -> str:
        """Generate SQL query from natural language using AI"""
        if not self.ai_available:
            return self._generate_fallback_sql(query, sector)
        
        try:
            # Create schema description
            schema_desc = self._format_schema_for_ai(schema)
            
            prompt = f"""
            You are a PostgreSQL expert. Convert the following natural language query to a safe SQL query based on the provided database schema.

            Database Schema:
            {schema_desc}

            Natural Language Query: {query}

            Requirements:
            1. Generate only SELECT statements (no INSERT, UPDATE, DELETE, DROP, etc.)
            2. Use proper PostgreSQL syntax
            3. Include appropriate WHERE clauses, GROUP BY, ORDER BY as needed
            4. Handle potential NULL values with COALESCE or NULLIF where appropriate
            5. Add LIMIT clauses for large result sets
            6. Use safe aggregation functions and avoid division by zero with NULLIF

            Return only the SQL query without any explanation or markdown formatting:
            """
            
            response = self.model.generate_content(prompt)
            sql_query = self._clean_sql_response(response.text)
            
            # Validate the SQL is safe
            if self._is_safe_sql(sql_query):
                return sql_query
            else:
                logger.warning("Generated SQL failed safety check, using fallback")
                return self._generate_fallback_sql(query, sector)
                
        except Exception as e:
            logger.error(f"AI SQL generation failed: {e}")
            return self._generate_fallback_sql(query, sector)
    
    async def analyze_chart_data(self, data: List[Dict], query: str) -> Dict[str, Any]:
        """Analyze data and recommend chart type using Google Gemini"""
        if not self.ai_available or not data:
            return self._fallback_chart_analysis(data)
        
        try:
            # Prepare data summary
            data_summary = self._summarize_data(data)
            
            # Create prompt for chart recommendation
            prompt = f"""
            Analyze the following data and recommend the best chart type for visualization:
            
            Query: {query}
            Data Summary: {data_summary}
            
            Based on the data structure and query type, recommend ONE of these chart types:
            - bar: for comparing categories or discrete values
            - line: for showing trends over time
            - pie: for showing parts of a whole (when data has percentages)
            - area: for showing cumulative values over time
            - scatter: for showing relationships between two variables
            
            Also provide brief insights about the data patterns.
            
            Format your response as:
            Chart: [chart_type]
            Insights: [your analysis]
            """
            
            # Generate response using Gemini
            response = self.model.generate_content(prompt)
            response_text = response.text
            
            # Parse the response
            chart_type = "bar"  # default
            insights = "Data analysis completed"
            
            for line in response_text.split('\n'):
                if line.lower().startswith('chart:'):
                    chart_type = line.split(':', 1)[1].strip().lower()
                elif line.lower().startswith('insights:'):
                    insights = line.split(':', 1)[1].strip()
            
            # Validate chart type
            valid_charts = ["bar", "line", "pie", "area", "scatter"]
            if chart_type not in valid_charts:
                chart_type = "bar"
            
            return {
                "recommended_chart": chart_type,
                "insights": insights,
                "confidence": "high"
            }
            
        except Exception as e:
            logger.error(f"Chart analysis failed: {e}")
            return self._fallback_chart_analysis(data)
    

    
    def _format_schema_for_ai(self, schema: Dict[str, Any]) -> str:
        """Format database schema for AI consumption"""
        tables = schema.get("tables", {})
        schema_desc = ""
        
        for table_name, table_info in tables.items():
            schema_desc += f"\nTable: {table_name}\n"
            columns = table_info.get("columns", {})
            for col_name, col_info in columns.items():
                schema_desc += f"  - {col_name}: {col_info.get('type', 'unknown')}"
                if not col_info.get('nullable', True):
                    schema_desc += " (NOT NULL)"
                schema_desc += "\n"
        
        return schema_desc
    
    def _parse_kpi_suggestions(self, ai_response: str) -> List[str]:
        """Parse KPI suggestions from AI response"""
        lines = ai_response.strip().split('\n')
        suggestions = []
        
        for line in lines:
            line = line.strip()
            # Remove bullet points, numbers, etc.
            line = re.sub(r'^[-*•\d.)\s]+', '', line)
            if line and len(line) > 10:  # Filter out very short lines
                suggestions.append(line)
        
        return suggestions
    
    def _clean_sql_response(self, sql_response: str) -> str:
        """Clean SQL response from AI"""
        # Remove markdown formatting
        sql = re.sub(r'```sql\s*', '', sql_response)
        sql = re.sub(r'```\s*', '', sql)
        
        # Remove extra whitespace
        sql = sql.strip()
        
        # Ensure it ends with semicolon
        if not sql.endswith(';'):
            sql += ';'
        
        return sql
    
    def _is_safe_sql(self, sql: str) -> bool:
        """Validate SQL is safe (only SELECT statements)"""
        sql_upper = sql.upper().strip()
        
        # Check for dangerous keywords
        dangerous_keywords = [
            'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 
            'TRUNCATE', 'EXEC', 'EXECUTE', 'GRANT', 'REVOKE'
        ]
        
        for keyword in dangerous_keywords:
            if keyword in sql_upper:
                return False
        
        # Must start with SELECT
        return sql_upper.startswith('SELECT')
    
    def _generate_fallback_kpi_suggestions(self, sector: str) -> List[str]:
        """Generate fallback KPI suggestions when AI is unavailable"""
        if sector == "bank":
            return [
                "What is the total loan amount by loan status?",
                "How many customers do we have by account type?",
                "What is the average transaction amount per month?",
                "Which loan types have the highest default rates?",
                "What is the monthly payment performance trend?"
            ]
        elif sector == "ithr":
            return [
                "What is the average salary by department?",
                "How many employees are in each department?",
                "What is the employee turnover rate by year?",
                "Which departments have the highest hiring rates?",
                "What is the performance rating distribution?"
            ]
        else:
            return [
                "What is the total count by category?",
                "What is the average value by group?",
                "How has the trend changed over time?",
                "Which categories have the highest performance?",
                "What is the distribution of key metrics?"
            ]
    
    def _generate_fallback_sql(self, query: str, sector: str) -> str:
        """Generate fallback SQL when AI is unavailable"""
        query_lower = query.lower()
        
        if "salary" in query_lower or "department" in query_lower:
            if "average" in query_lower:
                return """
                SELECT department, 
                       AVG(COALESCE(salary, 0)) as avg_salary,
                       COUNT(*) as employee_count 
                FROM employees 
                GROUP BY department 
                ORDER BY avg_salary DESC 
                LIMIT 10;
                """
            else:
                return """
                SELECT department, COUNT(*) as employee_count 
                FROM employees 
                GROUP BY department 
                ORDER BY employee_count DESC 
                LIMIT 10;
                """
        
        elif "loan" in query_lower or "customer" in query_lower:
            if "amount" in query_lower:
                return """
                SELECT loan_status, 
                       SUM(COALESCE(loan_amount, 0)) as total_amount,
                       COUNT(*) as loan_count 
                FROM loans 
                GROUP BY loan_status 
                ORDER BY total_amount DESC;
                """
            else:
                return """
                SELECT customer_type, COUNT(*) as customer_count 
                FROM customers 
                GROUP BY customer_type 
                ORDER BY customer_count DESC;
                """
        
        else:
            # Generic fallback
            return "SELECT 'No data available' as message, 0 as count;"
    
    def _summarize_data(self, data: List[Dict]) -> str:
        """Summarize data for chart analysis"""
        if not data:
            return "No data"
        
        # Get column info
        if data:
            columns = list(data[0].keys())
            row_count = len(data)
            
            summary = f"Columns: {', '.join(columns)}, Rows: {row_count}"
            
            # Add sample values
            if row_count > 0:
                sample = {k: v for k, v in list(data[0].items())[:3]}
                summary += f", Sample: {sample}"
            
            return summary
        
        return "Empty dataset"
    
    def _fallback_chart_analysis(self, data: List[Dict]) -> Dict[str, Any]:
        """Fallback chart analysis when AI is unavailable"""
        if not data:
            return {
                "recommended_chart": "bar",
                "insights": "No data available for analysis",
                "confidence": "low"
            }
        
        # Simple heuristics for chart recommendation
        if len(data) <= 5:
            chart_type = "pie"
        elif any("date" in str(k).lower() or "time" in str(k).lower() for k in data[0].keys()):
            chart_type = "line"
        else:
            chart_type = "bar"
        
        return {
            "recommended_chart": chart_type,
            "insights": f"Analysis of {len(data)} data points completed",
            "confidence": "medium"
        }