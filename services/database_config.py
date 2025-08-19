"""
Database Configuration Service
Manages multiple database connections per user with schema extraction
"""

import json
import os
import logging
from typing import Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

class DatabaseConfigService:
    """Manages database configurations and connections"""
    
    def __init__(self):
        self.config_file = "server/config/database.json"
        self.ensure_config_directory()
        
    def ensure_config_directory(self):
        """Ensure the config directory exists"""
        os.makedirs(os.path.dirname(self.config_file), exist_ok=True)
        
    def load_config(self) -> Dict[str, Any]:
        """Load configuration from file"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading config: {e}")
        return {}
    
    def save_config(self, config: Dict[str, Any]):
        """Save configuration to file"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving config: {e}")
    
    async def test_connection(self, connection_details: Dict[str, Any]) -> bool:
        """Test database connection"""
        try:
            conn = psycopg2.connect(
                host=connection_details["host"],
                port=connection_details["port"],
                database=connection_details["database"],
                user=connection_details["username"],
                password=connection_details["password"],
                connect_timeout=10
            )
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False
    
    async def extract_schema(self, connection_details: Dict[str, Any]) -> Dict[str, Any]:
        """Extract database schema using SQL introspection"""
        try:
            conn = psycopg2.connect(
                host=connection_details["host"],
                port=connection_details["port"],
                database=connection_details["database"],
                user=connection_details["username"],
                password=connection_details["password"],
                cursor_factory=RealDictCursor
            )
            
            with conn.cursor() as cursor:
                # Get tables and their columns
                cursor.execute("""
                    SELECT 
                        t.table_name,
                        c.column_name,
                        c.data_type,
                        c.is_nullable,
                        c.column_default,
                        tc.constraint_type
                    FROM 
                        information_schema.tables t
                    LEFT JOIN 
                        information_schema.columns c ON t.table_name = c.table_name
                    LEFT JOIN 
                        information_schema.table_constraints tc ON t.table_name = tc.table_name 
                        AND tc.constraint_type = 'PRIMARY KEY'
                    WHERE 
                        t.table_schema = 'public' 
                        AND t.table_type = 'BASE TABLE'
                    ORDER BY 
                        t.table_name, c.ordinal_position;
                """)
                
                results = cursor.fetchall()
                
                # Organize schema data
                tables = {}
                for row in results:
                    table_name = str(row['table_name'])
                    if table_name not in tables:
                        tables[table_name] = {
                            "columns": {},
                            "primary_keys": []
                        }
                    
                    column_name = row['column_name']
                    if column_name:
                        tables[table_name]["columns"][str(column_name)] = {
                            "type": str(row['data_type']),
                            "nullable": str(row['is_nullable']) == 'YES',
                            "default": str(row['column_default']) if row['column_default'] else None
                        }
                        
                        if str(row['constraint_type']) == 'PRIMARY KEY':
                            tables[table_name]["primary_keys"].append(str(column_name))
                
                # Get foreign key relationships
                cursor.execute("""
                    SELECT 
                        tc.table_name,
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name
                    FROM 
                        information_schema.table_constraints tc
                    JOIN 
                        information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    JOIN 
                        information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
                    WHERE 
                        tc.constraint_type = 'FOREIGN KEY'
                        AND tc.table_schema = 'public';
                """)
                
                foreign_keys = cursor.fetchall()
                for fk in foreign_keys:
                    table_name = str(fk['table_name'])
                    if table_name in tables:
                        if 'foreign_keys' not in tables[table_name]:
                            tables[table_name]['foreign_keys'] = []
                        tables[table_name]['foreign_keys'].append({
                            "column": str(fk['column_name']),
                            "references_table": str(fk['foreign_table_name']),
                            "references_column": str(fk['foreign_column_name'])
                        })
                
                conn.close()
                
                schema = {
                    "tables": tables,
                    "database_name": connection_details["database"],
                    "extracted_at": "now()"
                }
                
                logger.info(f"Extracted schema with {len(tables)} tables from database {connection_details['database']}")
                return schema
                
        except Exception as e:
            logger.error(f"Schema extraction failed: {e}")
            raise Exception(f"Failed to extract schema: {str(e)}")
    
    async def add_connection(self, user_id: str, connection_name: str, connection_details: Dict[str, Any]) -> Dict[str, Any]:
        """Add new database connection with schema extraction"""
        try:
            # Test connection first
            if not await self.test_connection(connection_details):
                return {"success": False, "error": "Failed to connect to database"}
            
            # Load existing config
            config = self.load_config()
            
            # Initialize user section if not exists
            if user_id not in config:
                config[user_id] = {"connections": {}, "active_connection": None}
            
            # Check for existing connection with same details
            existing_connection_id = None
            for conn_id, conn_data in config[user_id]["connections"].items():
                if (conn_data["host"] == connection_details["host"] and
                    conn_data["port"] == connection_details["port"] and
                    conn_data["database"] == connection_details["database"] and
                    conn_data["username"] == connection_details["username"]):
                    existing_connection_id = conn_id
                    break
            
            # Extract schema
            schema = await self.extract_schema(connection_details)
            
            # Use existing connection or create new one
            if existing_connection_id:
                # Update existing connection with fresh schema
                config[user_id]["connections"][existing_connection_id].update(connection_details)
                config[user_id]["connections"][existing_connection_id]["schema"] = schema
                config[user_id]["active_connection"] = existing_connection_id
                
                self.save_config(config)
                return {
                    "success": True, 
                    "schema": schema, 
                    "existingConnectionId": existing_connection_id,
                    "isExisting": True
                }
            else:
                # Create new connection
                connection_data = {**connection_details, "schema": schema}
                config[user_id]["connections"][connection_name] = connection_data
                config[user_id]["active_connection"] = connection_name
                
                self.save_config(config)
                return {"success": True, "schema": schema, "isExisting": False}
                
        except Exception as e:
            logger.error(f"Error adding connection: {e}")
            return {"success": False, "error": str(e)}
    
    def get_current_connection(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get current active connection for user"""
        config = self.load_config()
        if user_id in config and config[user_id]["active_connection"]:
            connection_id = config[user_id]["active_connection"]
            return config[user_id]["connections"].get(connection_id)
        return None
    
    def get_all_connections(self, user_id: str) -> Dict[str, Any]:
        """Get all connections for user"""
        config = self.load_config()
        if user_id in config:
            return config[user_id]["connections"]
        return {}
    
    def set_active_connection(self, user_id: str, connection_id: str) -> bool:
        """Set active connection for user"""
        try:
            config = self.load_config()
            if user_id in config and connection_id in config[user_id]["connections"]:
                config[user_id]["active_connection"] = connection_id
                self.save_config(config)
                return True
        except Exception as e:
            logger.error(f"Error setting active connection: {e}")
        return False
    
    def remove_connection(self, user_id: str, connection_id: str) -> bool:
        """Remove connection for user"""
        try:
            config = self.load_config()
            if user_id in config and connection_id in config[user_id]["connections"]:
                del config[user_id]["connections"][connection_id]
                if config[user_id]["active_connection"] == connection_id:
                    config[user_id]["active_connection"] = None
                self.save_config(config)
                return True
        except Exception as e:
            logger.error(f"Error removing connection: {e}")
        return False