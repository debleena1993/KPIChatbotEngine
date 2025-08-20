from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
except ImportError:
    genai = None
    GENAI_AVAILABLE = False
from typing import Optional, Dict, Any, List

app = FastAPI(title="KPI Chatbot Full Stack App")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE: Static file mounting moved to the end after API routes are defined

# Security
security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# Configure Google Gemini AI
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY and GENAI_AVAILABLE:
    genai.configure(api_key=GOOGLE_API_KEY)
    print("✅ Google Gemini AI configured successfully")
elif not GENAI_AVAILABLE:
    print("⚠️ Warning: google-generativeai package not installed - AI features will use fallback")
else:
    print("⚠️ Warning: GOOGLE_API_KEY not found - AI features will use fallback")

# Predefined admin accounts (same as Node.js version)
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

# Pydantic models
class LoginCredentials(BaseModel):
    username: str
    password: str

class DatabaseConnection(BaseModel):
    host: str
    port: int
    database: str
    username: str
    password: str

class QueryRequest(BaseModel):
    query: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class User(BaseModel):
    username: str
    sector: str
    role: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("username")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=str(username))
    except JWTError:
        raise credentials_exception
    
    account = ADMIN_ACCOUNTS.get(str(username))
    if account is None:
        raise credentials_exception
    
    return {
        "username": username,
        "sector": account["sector"],
        "role": account["role"]
    }

# Authentication routes
@app.post("/api/login", response_model=Token)
async def login(credentials: LoginCredentials):
    """Login endpoint that matches the Node.js implementation"""
    account = ADMIN_ACCOUNTS.get(credentials.username)
    
    if not account or account["password"] != credentials.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "username": credentials.username,
            "sector": account["sector"],
            "role": account["role"]
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": credentials.username,
            "sector": account["sector"],
            "role": account["role"]
        }
    }

@app.post("/api/logout")
async def logout(current_user: dict = Depends(verify_token)):
    """Logout endpoint that clears the session"""
    session_key = current_user["username"]
    if session_key in sessions:
        del sessions[session_key]
    
    return {"status": "logged out"}

@app.get("/api/me", response_model=User)
async def get_current_user(current_user: dict = Depends(verify_token)):
    """Get current user information"""
    return User(
        username=current_user["username"],
        sector=current_user["sector"],
        role=current_user["role"]
    )

# Database connection and session management
class DatabaseManager:
    def __init__(self):
        self.config_path = "./config/database.json"
        self.sessions = {}
        
    def load_config(self):
        try:
            with open(self.config_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return {"users": {}}
    
    def save_config(self, config):
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump(config, f, indent=2)
    
    def test_connection(self, conn_params):
        try:
            # Check if SSL is required for cloud databases
            requires_ssl = any(cloud in conn_params["host"] for cloud in [
                'neon.tech', 'supabase.', 'amazonaws.com', 'planetscale.', 'railway.'
            ])
            
            conn = psycopg2.connect(
                host=conn_params["host"],
                port=conn_params["port"],
                database=conn_params["database"],
                user=conn_params["username"],
                password=conn_params["password"],
                sslmode='require' if requires_ssl else 'prefer',
                connect_timeout=30
            )
            
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
            conn.close()
            return True
        except Exception as e:
            print(f"Database connection test failed: {e}")
            return False
    
    def extract_schema(self, conn_params):
        requires_ssl = any(cloud in conn_params["host"] for cloud in [
            'neon.tech', 'supabase.', 'amazonaws.com', 'planetscale.', 'railway.'
        ])
        
        conn = psycopg2.connect(
            host=conn_params["host"],
            port=conn_params["port"],
            database=conn_params["database"],
            user=conn_params["username"],
            password=conn_params["password"],
            sslmode='require' if requires_ssl else 'prefer',
            connect_timeout=30,
            cursor_factory=RealDictCursor
        )
        
        try:
            with conn.cursor() as cursor:
                # Get all tables
                cursor.execute("""
                    SELECT table_name, table_schema
                    FROM information_schema.tables 
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                    ORDER BY table_name
                """)
                tables_data = cursor.fetchall()
                
                formatted_tables = {}
                for table_row in tables_data:
                    table_name = table_row['table_name']
                    table_schema = table_row['table_schema']
                    
                    # Get columns for each table
                    cursor.execute("""
                        SELECT column_name, data_type, is_nullable, column_default,
                               character_maximum_length, numeric_precision, numeric_scale
                        FROM information_schema.columns 
                        WHERE table_name = %s AND table_schema = %s
                        ORDER BY ordinal_position
                    """, (table_name, table_schema))
                    
                    columns_data = cursor.fetchall()
                    columns = {}
                    
                    for col in columns_data:
                        columns[col['column_name']] = {
                            'type': col['data_type'],
                            'nullable': col['is_nullable'] == 'YES',
                            'default': col['column_default']
                        }
                    
                    formatted_tables[table_name] = {'columns': columns}
                
                return {
                    'tables': formatted_tables,
                    'extractedAt': datetime.now().isoformat(),
                    'totalTables': len(formatted_tables)
                }
                
        finally:
            conn.close()

# Initialize database manager
db_manager = DatabaseManager()

# AI-powered KPI suggestions
def generate_kpi_suggestions(schema: dict, sector: str) -> List[dict]:
    if not GOOGLE_API_KEY or not GENAI_AVAILABLE:
        return get_fallback_suggestions(sector)
    
    try:
        model = genai.GenerativeModel('gemini-2.5-pro')
        
        system_prompt = """You are an expert data analyst who generates KPI suggestions based on database schemas.

Rules:
1. Generate exactly 5 practical KPI suggestions
2. Focus on measurable business metrics relevant to the sector
3. Consider common patterns like totals, counts, averages, trends, and ratios
4. Include natural language query templates that users can ask
5. Categorize KPIs (e.g., Financial, Operational, Customer, Performance)
6. Make suggestions specific to the actual data structure available

Respond with JSON array in this exact format:
[
  {
    "id": "unique_kpi_id",
    "name": "Human-readable KPI Name",
    "description": "What this KPI measures and why it's useful",
    "query_template": "Natural language question a user would ask",
    "category": "Category name"
  }
]"""

        schema_text = json.dumps(schema, indent=2)
        prompt = f"""Business Sector: {sector}

Database Schema:
{schema_text}

Based on this database schema for a {sector} business, generate relevant KPI suggestions that can be calculated from the available data."""

        response = model.generate_content([
            {"role": "system", "parts": [system_prompt]},
            {"role": "user", "parts": [prompt]}
        ])
        
        suggestions = json.loads(response.text)
        return suggestions[:5]  # Limit to 5
        
    except Exception as e:
        print(f"AI KPI generation failed: {e}")
        return get_fallback_suggestions(sector)

def get_fallback_suggestions(sector: str) -> List[dict]:
    if sector == "bank":
        return [
            {"id": "total_loans", "name": "Total Loan Amount", "description": "Sum of all active loans", "query_template": "What is the total amount of all loans?", "category": "Financial"},
            {"id": "avg_loan_amount", "name": "Average Loan Amount", "description": "Average loan amount by type", "query_template": "What is the average loan amount?", "category": "Financial"},
            {"id": "loan_status_breakdown", "name": "Loan Status Distribution", "description": "Count of loans by status", "query_template": "Show me the breakdown of loans by status", "category": "Operational"},
            {"id": "customer_count", "name": "Total Customers", "description": "Count of all customers", "query_template": "How many customers do we have?", "category": "Customer"},
            {"id": "payment_trends", "name": "Payment Trends", "description": "Monthly payment amounts", "query_template": "Show me payment trends over time", "category": "Financial"}
        ]
    else:  # ithr
        return [
            {"id": "employee_count", "name": "Total Employees", "description": "Count of all employees", "query_template": "How many employees do we have?", "category": "HR"},
            {"id": "dept_distribution", "name": "Department Distribution", "description": "Employee count by department", "query_template": "Show me employees by department", "category": "Operational"},
            {"id": "avg_salary", "name": "Average Salary", "description": "Average salary by role", "query_template": "What is the average salary?", "category": "Financial"},
            {"id": "active_projects", "name": "Active Projects", "description": "Count of ongoing projects", "query_template": "How many active projects do we have?", "category": "Operational"},
            {"id": "performance_metrics", "name": "Performance Metrics", "description": "Employee performance statistics", "query_template": "Show me performance metrics", "category": "Performance"}
        ]

def generate_sql_from_query(query: str, schema: dict, sector: str) -> str:
    if not GOOGLE_API_KEY or not GENAI_AVAILABLE:
        return get_fallback_sql(schema)
    
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        schema_text = json.dumps(schema, indent=2)
        system_prompt = f"""You are an expert SQL generator for {sector} business data analysis.

Rules:
1. Generate safe, read-only SELECT queries only
2. Use proper PostgreSQL syntax
3. Include appropriate WHERE clauses for filtering
4. Use aggregate functions when appropriate (COUNT, SUM, AVG, etc.)
5. Add ORDER BY and LIMIT when helpful
6. Consider the business context of {sector}
7. Return ONLY the SQL query with no markdown formatting, no explanations, no code blocks
8. Start the response directly with "SELECT" keyword
9. IMPORTANT: Always use NULLIF or CASE statements to prevent division by zero errors
10. For percentage calculations, use: (numerator * 100.0) / NULLIF(denominator, 0)
11. For ratios, use: numerator / NULLIF(denominator, 0)

Available schema:
{schema_text}"""

        prompt = f"Generate SQL for: {query}\n\nRemember: Return ONLY the SQL query starting with SELECT, no code blocks or explanations."
        
        response = model.generate_content([
            {"role": "system", "parts": [system_prompt]},
            {"role": "user", "parts": [prompt]}
        ])
        
        sql = response.text.strip()
        
        # Clean up markdown formatting if present
        if '```' in sql:
            import re
            sql_match = re.search(r'```(?:sql)?\s*(SELECT[\s\S]*?)\s*```', sql, re.IGNORECASE)
            if sql_match:
                sql = sql_match.group(1).strip()
        
        # Ensure it starts with SELECT
        sql = re.sub(r'^[^S]*SELECT', 'SELECT', sql, flags=re.IGNORECASE)
        
        return sql
        
    except Exception as e:
        print(f"AI SQL generation failed: {e}")
        return get_fallback_sql(schema)

def get_fallback_sql(schema: dict) -> str:
    tables = list(schema.get('tables', {}).keys())
    if tables:
        first_table = tables[0]
        columns = list(schema['tables'][first_table]['columns'].keys())[:5]
        return f"SELECT {', '.join(columns)} FROM {first_table} LIMIT 10"
    return "SELECT 1 as sample_data"

def execute_query(sql: str, conn_params: dict) -> dict:
    requires_ssl = any(cloud in conn_params["host"] for cloud in [
        'neon.tech', 'supabase.', 'amazonaws.com', 'planetscale.', 'railway.'
    ])
    
    start_time = datetime.now()
    
    conn = psycopg2.connect(
        host=conn_params["host"],
        port=conn_params["port"],
        database=conn_params["database"],
        user=conn_params["username"],
        password=conn_params["password"],
        sslmode='require' if requires_ssl else 'prefer',
        cursor_factory=RealDictCursor
    )
    
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()
            
            if not rows:
                return {
                    'table_data': [],
                    'columns': [],
                    'row_count': 0,
                    'execution_time': (datetime.now() - start_time).total_seconds(),
                    'chart_data': None
                }
            
            # Convert to list of dicts and get columns
            table_data = [dict(row) for row in rows]
            columns = list(rows[0].keys()) if rows else []
            
            # Prepare chart data
            chart_data = None
            if len(table_data) > 0 and len(columns) >= 2:
                chart_data = {
                    'data': table_data,
                    'xAxis': columns[0],
                    'yAxis': columns[1] if len(columns) > 1 else columns[0],
                    'chart_type': 'bar'  # Default chart type
                }
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            return {
                'table_data': table_data,
                'columns': columns,
                'row_count': len(table_data),
                'execution_time': execution_time,
                'chart_data': chart_data
            }
            
    finally:
        conn.close()

# Database connection endpoint
@app.post("/api/connect-db")
async def connect_database(connection_data: DatabaseConnection, current_user: dict = Depends(verify_token)):
    try:
        conn_params = connection_data.dict()
        
        # Test connection
        if not db_manager.test_connection(conn_params):
            raise HTTPException(status_code=400, detail="Failed to connect to database with provided credentials")
        
        # Extract schema
        schema = db_manager.extract_schema(conn_params)
        
        # Store session data
        session_key = current_user["username"]
        db_manager.sessions[session_key] = {
            'db_connection': conn_params,
            'schema': schema,
            'lastUpdated': datetime.now().isoformat()
        }
        
        # Generate AI-powered KPI suggestions
        suggested_kpis = generate_kpi_suggestions(schema, current_user["sector"])
        
        # Save to config file
        config = db_manager.load_config()
        if current_user["username"] not in config["users"]:
            config["users"][current_user["username"]] = {"connections": {}, "currentConnection": None}
        
        connection_id = f"{current_user['username']}_{int(datetime.now().timestamp())}"
        config["users"][current_user["username"]]["connections"][connection_id] = {
            **conn_params,
            "type": "postgresql",
            "isActive": True,
            "schema": schema,
            "lastConnected": datetime.now().isoformat()
        }
        config["users"][current_user["username"]]["currentConnection"] = connection_id
        
        db_manager.save_config(config)
        
        return {
            "status": "connected",
            "schema": schema,
            "suggested_kpis": suggested_kpis,
            "connectionName": connection_id,
            "message": "Database connected and schema extracted successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

# Get database configuration
@app.get("/api/database-config")
async def get_database_config(current_user: dict = Depends(verify_token)):
    try:
        config = db_manager.load_config()
        user_config = config.get("users", {}).get(current_user["username"], {})
        
        current_connection_id = user_config.get("currentConnection")
        current_connection = None
        
        if current_connection_id and current_connection_id in user_config.get("connections", {}):
            current_connection = user_config["connections"][current_connection_id].copy()
            current_connection["password"] = "***"  # Hide password
        
        connections = []
        for conn_id, conn_data in user_config.get("connections", {}).items():
            conn_copy = conn_data.copy()
            conn_copy["password"] = "***"
            connections.append({"id": conn_id, **conn_copy})
        
        return {
            "success": True,
            "currentConnection": current_connection,
            "connections": connections
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get database configuration: {str(e)}")

# Get schema
@app.get("/api/schema")
async def get_schema(current_user: dict = Depends(verify_token)):
    session_key = current_user["username"]
    if session_key not in db_manager.sessions:
        raise HTTPException(status_code=400, detail="No active database connection")
    
    session_data = db_manager.sessions[session_key]
    return {
        "schema": session_data["schema"],
        "lastUpdated": session_data["lastUpdated"]
    }

# Query KPI endpoint
@app.post("/api/query-kpi")
async def query_kpi(query_request: QueryRequest, current_user: dict = Depends(verify_token)):
    try:
        session_key = current_user["username"]
        if session_key not in db_manager.sessions:
            raise HTTPException(status_code=400, detail="No active database connection")
        
        session_data = db_manager.sessions[session_key]
        schema = session_data["schema"]
        conn_params = session_data["db_connection"]
        
        # Generate SQL from natural language query
        sql_query = generate_sql_from_query(query_request.query, schema, current_user["sector"])
        
        # Execute the query
        results = execute_query(sql_query, conn_params)
        
        return {
            "query": query_request.query,
            "sql_query": sql_query,
            "results": results,
            "execution_time": results["execution_time"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query execution failed: {str(e)}")

# Serve static files from the built frontend (AFTER all API routes)
app.mount("/assets", StaticFiles(directory="../dist/public/assets"), name="assets")
app.mount("/", StaticFiles(directory="../dist/public", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)