#!/usr/bin/env python3
"""
Multi-Sector AI-Powered KPI Chatbot
FastAPI Backend Implementation
"""

import os
import uvicorn
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import logging

from backend.auth import get_current_user, create_access_token, verify_password
from backend.database import DatabaseManager
from backend.gemini import GeminiService, generate_kpi_suggestions
from backend.models import (
    LoginRequest, LoginResponse, DatabaseConnectionRequest, 
    DatabaseConnectionResponse, KPIQueryRequest, KPIQueryResponse,
    User, KPISuggestion, SectorEnum, RoleEnum
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
db_manager = DatabaseManager()
gemini_service = GeminiService()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    logger.info("Starting Multi-Sector KPI Chatbot API")
    yield
    logger.info("Shutting down gracefully...")
    await db_manager.cleanup()

# Create FastAPI app
app = FastAPI(
    title="Multi-Sector AI-Powered KPI Chatbot",
    description="FastAPI backend for AI-powered KPI analysis with multi-sector support",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Mount static files for the frontend
app.mount("/assets", StaticFiles(directory="dist/public/assets"), name="assets")

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

@app.post("/api/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Authenticate user and return JWT token"""
    try:
        account = ADMIN_ACCOUNTS.get(request.username)
        if not account or not verify_password(request.password, account["password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        # Create JWT token
        token = create_access_token({
            "sub": request.username,
            "sector": account["sector"],
            "role": account["role"]
        })
        
        return LoginResponse(
            access_token=token,
            token_type="bearer",
            user=User(
                username=request.username,
                sector=SectorEnum(account["sector"]),
                role=RoleEnum(account["role"])
            )
        )
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request"
        )

@app.post("/api/connect-db")
async def connect_database(
    request: DatabaseConnectionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Connect to database and extract schema"""
    try:
        username = current_user["sub"]
        connection_name = f"{username}_{int(__import__('time').time())}"
        
        # Test connection and extract schema
        result = await db_manager.add_connection(
            username, 
            connection_name, 
            {
                "host": request.host,
                "port": request.port,
                "database": request.database,
                "username": request.username,
                "password": request.password
            }
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result["error"]
            )
        
        # Generate KPI suggestions based on schema
        try:
            suggestions = await generate_kpi_suggestions(
                result["schema"], 
                current_user["sector"]
            )
        except Exception as e:
            logger.error(f"KPI generation error: {str(e)}")
            # Use fallback suggestions from backend.gemini
            from backend.gemini import get_fallback_kpi_suggestions
            suggestions = get_fallback_kpi_suggestions(current_user["sector"])
        
        return {
            "status": "connected",
            "message": "Database connected successfully",
            "schema": result["schema"],
            "connection_name": connection_name,
            "suggested_kpis": suggestions
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Database connection error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to connect to database"
        )

@app.get("/api/database-config")
async def get_database_config(current_user: dict = Depends(get_current_user)):
    """Get user's database configurations"""
    try:
        username = current_user["sub"]
        configs = db_manager.get_user_connections(username)
        active_connection = db_manager.get_active_connection(username)
        
        return {
            "success": True,
            "databases": configs,
            "currentConnection": {
                "host": active_connection["connection_params"]["host"] if active_connection else None,
                "database": active_connection["connection_params"]["database"] if active_connection else None,
                "isConnected": bool(active_connection)
            }
        }
    except Exception as e:
        logger.error(f"Get database config error: {str(e)}")
        return {
            "success": True,
            "databases": [],
            "currentConnection": {
                "host": None,
                "database": None,
                "isConnected": False
            }
        }

@app.post("/api/query-kpi", response_model=KPIQueryResponse)
async def query_kpi(
    request: KPIQueryRequest,
    current_user: dict = Depends(get_current_user)
):
    """Process natural language KPI query and return results"""
    try:
        username = current_user["sub"]
        
        # Get active database connection
        active_connection = db_manager.get_active_connection(username)
        if not active_connection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active database connection. Please connect to a database first."
            )
        
        # Generate SQL using Gemini AI
        schema = active_connection.get("schema", {})
        try:
            sql_query = await gemini_service.generate_sql_from_query(
                request.query, 
                schema, 
                current_user["sector"]
            )
            # Validate the generated SQL
            if not sql_query or not sql_query.strip():
                raise Exception("Empty SQL generated")
        except Exception as ai_error:
            logger.warning(f"AI SQL generation failed: {str(ai_error)}")
            # Fallback to pattern-based SQL generation
            sql_query = generate_fallback_sql(request.query, schema, current_user["sector"])
        
        # Validate SQL before execution
        if not sql_query or not sql_query.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to generate SQL query. Please try rephrasing your request."
            )
        
        # Execute query safely
        results = await db_manager.execute_query(username, sql_query)
        
        if not results["success"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=results["error"]
            )
        
        # Process results for charts if data is available
        chart_data = None
        chart_config = None
        
        if results["data"]:
            chart_data, chart_config = process_data_for_charts(results["data"])
        
        return KPIQueryResponse(
            query=request.query,
            sql_query=sql_query,
            data=results["data"],
            columns=results["columns"],
            chart_data=chart_data,
            chart_config=chart_config
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"KPI query error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process KPI query"
        )

@app.get("/api/schema")
async def get_schema(current_user: dict = Depends(get_current_user)):
    """Get the schema for the active database connection"""
    try:
        username = current_user["sub"]
        active_connection = db_manager.get_active_connection(username)
        
        if not active_connection:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active database connection"
            )
        
        return {
            "schema": {
                "tables": active_connection.get("schema", {})
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get schema error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve schema"
        )

@app.post("/api/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout user and cleanup connections"""
    try:
        username = current_user["sub"]
        await db_manager.cleanup_user_connections(username)
        return {"message": "Logged out successfully"}
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )

def generate_fallback_sql(query: str, schema: dict, sector: str = "general") -> str:
    """Generate basic SQL queries when AI is unavailable"""
    query_lower = query.lower()
    
    # Simple pattern matching for common queries
    if "loan" in query_lower and "type" in query_lower:
        return """
        SELECT COALESCE(loan_type, 'Unknown') AS loan_type, 
               COUNT(*) AS loan_count, 
               SUM(COALESCE(loan_amount, 0)) AS total_amount 
        FROM loans 
        GROUP BY loan_type 
        ORDER BY loan_count DESC;
        """
    elif "payment" in query_lower and "month" in query_lower:
        return """
        SELECT TO_CHAR(payment_date, 'YYYY-MM') AS month, 
               SUM(COALESCE(amount_paid, 0)) AS total_payments 
        FROM payments 
        WHERE payment_date >= CURRENT_DATE - INTERVAL '12 months' 
        GROUP BY month 
        ORDER BY month;
        """
    elif "total" in query_lower and "loan" in query_lower:
        return """
        SELECT COUNT(*) AS total_loans, 
               SUM(COALESCE(loan_amount, 0)) AS total_loan_value, 
               AVG(COALESCE(loan_amount, 0)) AS average_loan_amount 
        FROM loans 
        WHERE loan_amount > 0;
        """
    else:
        # Default query based on sector and available tables
        available_tables = list(schema.keys()) if schema else []
        if available_tables:
            first_table = available_tables[0]
            return f"SELECT COUNT(*) as total_records FROM {first_table} LIMIT 10;"
        else:
            return "SELECT 1 as status;"

def process_data_for_charts(data: list) -> tuple:
    """Process query results for chart visualization"""
    if not data or len(data) == 0:
        return None, None
    
    # Simple chart processing logic
    columns = list(data[0].keys()) if data else []
    
    if len(columns) >= 2:
        chart_config = {
            "type": "bar",
            "x_axis": columns[0],
            "y_axis": columns[1] if len(columns) > 1 else columns[0]
        }
        
        chart_data = [
            {
                "name": str(row[columns[0]]),
                "value": float(row[columns[1]]) if isinstance(row[columns[1]], (int, float)) else 0
            }
            for row in data[:20]  # Limit to 20 items for charts
        ]
        
        return chart_data, chart_config
    
    return None, None

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "KPI Chatbot API"}

# Frontend routes (must be at the end)
@app.get("/")
async def serve_frontend():
    """Serve the frontend application"""
    return FileResponse("dist/public/index.html")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve the SPA for all other routes"""
    return FileResponse("dist/public/index.html")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )