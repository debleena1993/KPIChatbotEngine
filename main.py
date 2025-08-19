"""
Multi-Sector AI-Powered KPI Chatbot - Python Backend
FastAPI implementation with all features from Node.js version
"""

import os
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from jose import JWTError, jwt
from passlib.context import CryptContext
import psycopg2
from psycopg2.extras import RealDictCursor

from services.database_config import DatabaseConfigService
from services.gemini_service import GeminiService
from services.query_executor import QueryExecutor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 1

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# Predefined admin accounts
ADMIN_ACCOUNTS = {
    "admin@bank": {
        "password": "bank123",
        "sector": "bank",
        "role": "admin"
    },
    "admin@ithr": {
        "password": "ithr123", 
        "sector": "ithr",
        "role": "admin"
    }
}

# Session storage (in production, use Redis)
sessions: Dict[str, Any] = {}

# Global services
db_service: Optional[DatabaseConfigService] = None
gemini_service: Optional[GeminiService] = None
query_executor: Optional[QueryExecutor] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global db_service, gemini_service, query_executor
    
    logger.info("Starting application...")
    
    # Initialize services
    db_service = DatabaseConfigService()
    gemini_service = GeminiService()
    query_executor = QueryExecutor()
    
    yield
    
    # Cleanup
    logger.info("Shutting down gracefully...")
    if query_executor:
        await query_executor.cleanup()

# Create FastAPI app
app = FastAPI(
    title="Multi-Sector AI-Powered KPI Chatbot",
    description="AI-powered KPI analysis for Banking and HR sectors",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

class DatabaseConnectionRequest(BaseModel):
    host: str
    port: int
    database: str
    username: str
    password: str

class QueryRequest(BaseModel):
    query: str

class SwitchDatabaseRequest(BaseModel):
    connectionId: str

# Auth utilities
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: Dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token and return current user"""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("username")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# API Routes
@app.post("/api/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Authenticate user and return JWT token"""
    account = ADMIN_ACCOUNTS.get(request.username)
    if not account or account["password"] != request.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token_data = {
        "username": request.username,
        "sector": account["sector"],
        "role": account["role"]
    }
    access_token = create_access_token(token_data)
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user={
            "username": request.username,
            "sector": account["sector"],
            "role": account["role"]
        }
    )

@app.post("/api/connect-db")
async def connect_database(request: DatabaseConnectionRequest, current_user: dict = Depends(get_current_user)):
    """Connect to database and extract schema"""
    try:
        connection_name = f"{current_user['username']}_{int(datetime.now().timestamp() * 1000)}"
        
        # Test connection and extract schema
        if not db_service:
            raise HTTPException(status_code=500, detail="Database service not available")
        result = await db_service.add_connection(
            current_user["username"],
            connection_name,
            {
                "host": request.host,
                "port": request.port,
                "database": request.database,
                "username": request.username,
                "password": request.password
            }
        )
        
        if result["success"]:
            # Clear previous session data
            session_key = current_user["username"]
            if session_key in sessions:
                logger.info(f"Clearing previous session data for user {current_user['username']}")
                del sessions[session_key]
            
            # Store fresh session data
            actual_connection_name = result.get("existingConnectionId", connection_name)
            sessions[session_key] = {
                "db_connection": {
                    "host": request.host,
                    "port": request.port,
                    "database": request.database,
                    "username": request.username,
                    "password": request.password
                },
                "schema": result["schema"],
                "connectionName": actual_connection_name,
                "lastUpdated": datetime.now().isoformat()
            }
            
            logger.info(f"Session created/updated for user {current_user['username']} with fresh schema from database {request.database}")
            logger.info(f"Schema contains {len(result['schema'].get('tables', {}))} tables")
            
            # Generate AI-powered KPI suggestions
            if not gemini_service:
                suggested_kpis = ["No AI service available"]
            else:
                suggested_kpis = await gemini_service.generate_kpi_suggestions(result["schema"], current_user["sector"])
            
            return {
                "status": "connected",
                "schema": result["schema"],
                "suggested_kpis": suggested_kpis,
                "connectionName": actual_connection_name,
                "message": "Database connection updated (existing connection reused to avoid duplicates)" if result.get("isExisting") else "Database connected and schema extracted successfully"
            }
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to connect to database"))
            
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error while connecting to database")

@app.get("/api/schema")
async def get_schema(current_user: dict = Depends(get_current_user)):
    """Get current database schema"""
    session_key = current_user["username"]
    if session_key not in sessions:
        raise HTTPException(status_code=400, detail="No active database connection")
    
    schema = sessions[session_key]["schema"]
    logger.info(f"Serving schema for user {current_user['username']}: {len(schema.get('tables', {}))} tables")
    
    return {
        "schema": schema,
        "lastUpdated": sessions[session_key]["lastUpdated"],
        "connectionName": sessions[session_key]["connectionName"]
    }

@app.post("/api/query-kpi")
async def query_kpi(request: QueryRequest, current_user: dict = Depends(get_current_user)):
    """Execute KPI query using AI-generated SQL"""
    try:
        session_key = current_user["username"]
        if session_key not in sessions:
            raise HTTPException(status_code=400, detail="No active database connection")
        
        # Generate AI-powered SQL query
        if not gemini_service:
            raise HTTPException(status_code=500, detail="AI service not available")
        sql_query = await gemini_service.generate_sql_from_query(
            request.query, 
            sessions[session_key]["schema"], 
            current_user["sector"]
        )
        
        # Execute the SQL query
        if not query_executor:
            raise HTTPException(status_code=500, detail="Query executor not available")
        results = await query_executor.execute_query(sql_query, current_user["username"])
        
        return {
            "query": request.query,
            "sql_query": sql_query,
            "results": results,
            "execution_time": results.get("execution_time", 0)
        }
        
    except Exception as e:
        logger.error(f"Query execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/database-config")
async def get_database_config(current_user: dict = Depends(get_current_user)):
    """Get current database configuration"""
    try:
        if not db_service:
            raise HTTPException(status_code=500, detail="Database service not available")
        current_connection = db_service.get_current_connection(current_user["username"])
        all_connections = db_service.get_all_connections(current_user["username"])
        
        connections = []
        for key, conn in all_connections.items():
            conn_copy = conn.copy()
            conn_copy["password"] = "***"  # Don't send password
            connections.append({"id": key, **conn_copy})
        
        return {
            "success": True,
            "currentConnection": current_connection,
            "connections": connections
        }
    except Exception as e:
        logger.error(f"Error getting database config: {e}")
        raise HTTPException(status_code=500, detail="Failed to get database configuration")

@app.post("/api/switch-database")
async def switch_database(request: SwitchDatabaseRequest, current_user: dict = Depends(get_current_user)):
    """Switch active database connection"""
    try:
        if not db_service:
            raise HTTPException(status_code=500, detail="Database service not available")
        success = db_service.set_active_connection(current_user["username"], request.connectionId)
        
        if success:
            current_connection = db_service.get_current_connection(current_user["username"])
            
            # Update session data with new connection's schema
            session_key = current_user["username"]
            if current_connection and current_connection.get("schema"):
                sessions[session_key] = {
                    "db_connection": {
                        "host": current_connection["host"],
                        "port": current_connection["port"],
                        "database": current_connection["database"],
                        "username": current_connection["username"],
                        "password": current_connection["password"]
                    },
                    "schema": current_connection["schema"],
                    "connectionName": request.connectionId
                }
                
                logger.info(f"Session updated for user {current_user['username']} with schema from database {current_connection['database']}")
            
            return {
                "success": True,
                "message": "Database connection switched successfully",
                "currentConnection": current_connection
            }
        else:
            raise HTTPException(status_code=400, detail="Invalid connection ID")
            
    except Exception as e:
        logger.error(f"Error switching database: {e}")
        raise HTTPException(status_code=500, detail="Failed to switch database connection")

@app.delete("/api/database-connection/{connection_id}")
async def remove_database_connection(connection_id: str, current_user: dict = Depends(get_current_user)):
    """Remove database connection"""
    try:
        if not db_service:
            raise HTTPException(status_code=500, detail="Database service not available")
        success = db_service.remove_connection(current_user["username"], connection_id)
        
        if success:
            return {
                "success": True,
                "message": "Database connection removed successfully"
            }
        else:
            raise HTTPException(status_code=400, detail="Connection not found or unable to remove")
            
    except Exception as e:
        logger.error(f"Error removing database connection: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove database connection")

@app.post("/api/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout user and clear session"""
    session_key = current_user["username"]
    if session_key in sessions:
        del sessions[session_key]
    return {"status": "logged out"}

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# Serve React frontend
@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the React frontend"""
    # In development, return a simple HTML that will connect to Vite dev server
    if os.getenv("NODE_ENV") == "development":
        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>KPI Chatbot - Loading...</title>
            <style>
                body { font-family: system-ui; margin: 0; padding: 40px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .status { color: #059669; font-weight: 600; margin-bottom: 20px; }
                .loading { color: #6366f1; }
                ul { line-height: 1.6; }
                .note { background: #fef3c7; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🐍 Python Backend Active</h1>
                <div class="status">✓ FastAPI server running successfully</div>
                <div class="loading">🔄 Connecting to React frontend...</div>
                
                <h3>Migration Status:</h3>
                <ul>
                    <li>✓ Python FastAPI backend converted from Node.js</li>
                    <li>✓ All API endpoints functional (/api/login, /api/connect-db, etc.)</li>
                    <li>✓ Database integration with PostgreSQL</li>
                    <li>✓ JWT authentication system</li>
                    <li>✓ Multi-sector support (Banking & HR)</li>
                    <li>✓ AI integration ready (with fallback mode)</li>
                </ul>
                
                <div class="note">
                    <strong>Note:</strong> The React frontend will automatically connect to this Python backend. 
                    All existing features have been preserved in the migration from Node.js to Python.
                </div>
            </div>
            
            <script>
                // Attempt to connect to Vite dev server after a short delay
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            </script>
        </body>
        </html>
        """
    else:
        # In production, serve the built React app
        if os.path.exists("dist/index.html"):
            with open("dist/index.html", "r") as f:
                return f.read()
        else:
            return "<h1>Production build not found. Run 'npm run build' first.</h1>"

# Serve static files in production
if os.getenv("NODE_ENV") != "development" and os.path.exists("dist"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
    app.mount("/static", StaticFiles(directory="dist/static"), name="static")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("NODE_ENV") == "development",
        log_level="info"
    )