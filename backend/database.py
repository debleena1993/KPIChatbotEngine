"""
Database connection and query execution management
"""

import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self):
        self.user_connections: Dict[str, Dict[str, Any]] = {}
        self.config_file = "server/config/database.json"
        self.load_config()
    
    def load_config(self):
        """Load database configurations from file"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    self.user_connections = json.load(f)
                logger.info("Loaded database configurations")
        except Exception as e:
            logger.error(f"Error loading config: {str(e)}")
            self.user_connections = {}
    
    def save_config(self):
        """Save database configurations to file"""
        try:
            os.makedirs(os.path.dirname(self.config_file), exist_ok=True)
            with open(self.config_file, 'w') as f:
                json.dump(self.user_connections, f, indent=2)
            logger.info("Saved database configurations")
        except Exception as e:
            logger.error(f"Error saving config: {str(e)}")
    
    async def test_connection(self, conn_params: Dict[str, Any]) -> Dict[str, Any]:
        """Test database connection"""
        try:
            conn = psycopg2.connect(
                host=conn_params["host"],
                port=conn_params["port"],
                database=conn_params["database"],
                user=conn_params["username"],
                password=conn_params["password"],
                connect_timeout=10
            )
            conn.close()
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def extract_schema(self, conn_params: Dict[str, Any]) -> Dict[str, Any]:
        """Extract database schema information"""
        try:
            conn = psycopg2.connect(
                host=conn_params["host"],
                port=conn_params["port"],
                database=conn_params["database"],
                user=conn_params["username"],
                password=conn_params["password"],
                cursor_factory=RealDictCursor
            )
            
            cursor = conn.cursor()
            
            # Get table information
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
                ORDER BY table_name;
            """)
            
            tables = cursor.fetchall()
            schema = {}
            
            for table in tables:
                table_name = dict(table)["table_name"]
                
                # Get column information for each table
                cursor.execute("""
                    SELECT 
                        column_name,
                        data_type,
                        is_nullable,
                        column_default
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = %s
                    ORDER BY ordinal_position;
                """, (table_name,))
                
                columns = cursor.fetchall()
                schema[table_name] = {
                    "columns": [dict(col) for col in columns]
                }
            
            conn.close()
            return {"success": True, "schema": schema}
            
        except Exception as e:
            logger.error(f"Schema extraction error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    async def add_connection(self, user_id: str, connection_name: str, conn_params: Dict[str, Any]) -> Dict[str, Any]:
        """Add a new database connection for a user"""
        try:
            # Test connection first
            test_result = await self.test_connection(conn_params)
            if not test_result["success"]:
                return test_result
            
            # Extract schema
            schema_result = await self.extract_schema(conn_params)
            if not schema_result["success"]:
                return schema_result
            
            # Initialize user connections if not exists
            if user_id not in self.user_connections:
                self.user_connections[user_id] = {}
            
            # Store connection info
            self.user_connections[user_id][connection_name] = {
                "connection_params": conn_params,
                "schema": schema_result["schema"],
                "is_active": True,
                "created_at": __import__('datetime').datetime.now().isoformat()
            }
            
            # Set all other connections for this user as inactive
            for conn_name in self.user_connections[user_id]:
                if conn_name != connection_name:
                    self.user_connections[user_id][conn_name]["is_active"] = False
            
            self.save_config()
            
            return {
                "success": True,
                "schema": schema_result["schema"],
                "connection_name": connection_name
            }
            
        except Exception as e:
            logger.error(f"Add connection error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def get_user_connections(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all database connections for a user"""
        if user_id not in self.user_connections:
            return []
        
        connections = []
        for conn_name, conn_data in self.user_connections[user_id].items():
            connections.append({
                "name": conn_name,
                "host": conn_data["connection_params"]["host"],
                "database": conn_data["connection_params"]["database"],
                "is_active": conn_data["is_active"],
                "created_at": conn_data["created_at"],
                "tables": list(conn_data["schema"].keys()) if conn_data["schema"] else []
            })
        
        return connections
    
    def get_active_connection(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get the active database connection for a user"""
        if user_id not in self.user_connections:
            return None
        
        for conn_name, conn_data in self.user_connections[user_id].items():
            if conn_data["is_active"]:
                return conn_data
        
        return None
    
    async def execute_query(self, user_id: str, sql_query: str) -> Dict[str, Any]:
        """Execute a SQL query on the user's active database connection"""
        try:
            active_conn = self.get_active_connection(user_id)
            if not active_conn:
                return {"success": False, "error": "No active database connection"}
            
            conn_params = active_conn["connection_params"]
            
            conn = psycopg2.connect(
                host=conn_params["host"],
                port=conn_params["port"],
                database=conn_params["database"],
                user=conn_params["username"],
                password=conn_params["password"],
                cursor_factory=RealDictCursor
            )
            
            cursor = conn.cursor()
            
            # Sanitize query - only allow SELECT statements
            sanitized_query = self.sanitize_sql(sql_query)
            if not sanitized_query:
                return {"success": False, "error": "Invalid or unsafe SQL query"}
            
            cursor.execute(sanitized_query)
            results = cursor.fetchall()
            
            # Get column names
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            
            conn.close()
            
            return {
                "success": True,
                "data": [dict(row) for row in results],
                "columns": columns
            }
            
        except Exception as e:
            logger.error(f"Query execution error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def sanitize_sql(self, sql_query: str) -> Optional[str]:
        """Sanitize SQL query to only allow safe SELECT operations"""
        # Remove markdown formatting
        sql_query = sql_query.replace('```sql', '').replace('```', '').strip()
        
        # Convert to uppercase for checking
        query_upper = sql_query.upper().strip()
        
        # Only allow SELECT statements
        if not query_upper.startswith('SELECT'):
            return None
        
        # Block dangerous keywords
        dangerous_keywords = [
            'DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 
            'TRUNCATE', 'EXEC', 'EXECUTE', 'MERGE', 'CALL'
        ]
        
        for keyword in dangerous_keywords:
            if keyword in query_upper:
                return None
        
        return sql_query
    
    async def cleanup_user_connections(self, user_id: str):
        """Cleanup connections for a user (on logout)"""
        if user_id in self.user_connections:
            del self.user_connections[user_id]
            self.save_config()
    
    async def cleanup(self):
        """Cleanup resources"""
        self.save_config()
        logger.info("Database manager cleanup completed")