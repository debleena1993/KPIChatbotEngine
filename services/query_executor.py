"""
Query Executor Service
Handles SQL query execution against connected databases
"""

import time
import logging
from typing import Dict, Any, List, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from services.database_config import DatabaseConfigService

logger = logging.getLogger(__name__)

class QueryExecutor:
    """Executes SQL queries against user databases"""
    
    def __init__(self):
        self.db_service = DatabaseConfigService()
        self.connections: Dict[str, Any] = {}
    
    async def execute_query(self, sql_query: str, user_id: str) -> Dict[str, Any]:
        """Execute SQL query against user's active database"""
        try:
            # Get user's current database connection
            connection_config = self.db_service.get_current_connection(user_id)
            if not connection_config:
                raise Exception("No active database connection")
            
            # Measure execution time
            start_time = time.time()
            
            # Execute query
            conn = psycopg2.connect(
                host=connection_config["host"],
                port=connection_config["port"],
                database=connection_config["database"],
                user=connection_config["username"],
                password=connection_config["password"],
                cursor_factory=RealDictCursor
            )
            
            with conn.cursor() as cursor:
                cursor.execute(sql_query)
                
                # Fetch results
                if cursor.description:
                    rows = cursor.fetchall()
                    columns = [desc[0] for desc in cursor.description]
                    
                    # Convert to list of dictionaries
                    table_data = [dict(row) for row in rows]
                    
                    # Generate chart data
                    chart_data = self._generate_chart_data(table_data, columns)
                    
                    execution_time = time.time() - start_time
                    
                    result = {
                        "table_data": table_data,
                        "chart_data": chart_data,
                        "columns": columns,
                        "row_count": len(table_data),
                        "execution_time": round(execution_time, 3)
                    }
                else:
                    # Query didn't return data (e.g., INSERT, UPDATE)
                    execution_time = time.time() - start_time
                    result = {
                        "table_data": [],
                        "chart_data": {"type": "bar", "data": [], "xAxis": "", "yAxis": ""},
                        "columns": [],
                        "row_count": 0,
                        "execution_time": round(execution_time, 3),
                        "message": "Query executed successfully"
                    }
            
            conn.close()
            return result
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Query execution failed for user {user_id}: {error_msg}")
            
            # Return error in a structured format
            return {
                "table_data": [],
                "chart_data": {"type": "bar", "data": [], "xAxis": "", "yAxis": ""},
                "columns": [],
                "row_count": 0,
                "execution_time": 0,
                "error": error_msg
            }
    
    def _generate_chart_data(self, table_data: List[Dict], columns: List[str]) -> Dict[str, Any]:
        """Generate chart data from query results"""
        if not table_data or len(columns) < 2:
            return {"type": "bar", "data": [], "xAxis": "", "yAxis": ""}
        
        # Determine chart type and axes based on data
        numeric_columns = []
        text_columns = []
        
        # Analyze column types from first row
        first_row = table_data[0]
        for col in columns:
            value = first_row.get(col)
            if isinstance(value, (int, float)) and value != 0:
                numeric_columns.append(col)
            else:
                text_columns.append(col)
        
        # Choose appropriate chart configuration
        if len(text_columns) >= 1 and len(numeric_columns) >= 1:
            # Use first text column as X-axis, first numeric as Y-axis
            x_axis = text_columns[0]
            y_axis = numeric_columns[0]
            
            # Determine chart type
            if len(table_data) <= 6 and len(text_columns) >= 1:
                chart_type = "pie"
                # For pie charts, we might want different data structure
                chart_data = table_data[:6]  # Limit to 6 slices for readability
            elif any("date" in col.lower() or "time" in col.lower() for col in columns):
                chart_type = "line"
                chart_data = table_data
            else:
                chart_type = "bar"
                chart_data = table_data
            
            return {
                "type": chart_type,
                "data": chart_data,
                "xAxis": x_axis,
                "yAxis": y_axis
            }
        else:
            # Fallback for single column or all numeric data
            return {
                "type": "bar",
                "data": table_data,
                "xAxis": columns[0] if columns else "",
                "yAxis": columns[1] if len(columns) > 1 else columns[0] if columns else ""
            }
    
    async def cleanup(self):
        """Clean up database connections"""
        for conn in self.connections.values():
            try:
                if conn and not conn.closed:
                    conn.close()
            except Exception as e:
                logger.error(f"Error closing connection: {e}")
        
        self.connections.clear()
        logger.info("Query executor cleanup completed")