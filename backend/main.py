from datetime import datetime, timedelta, timezone
import json
import os
from typing import Any, Dict, List, Optional

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .services.database_config import DatabaseConfigService
from .services.gemini import generate_kpi_suggestions, generate_sql_from_query
from .services.query_executor import QueryExecutor


class LoginCredentials(BaseModel):
    username: str
    password: str


class DatabaseConnection(BaseModel):
    host: str
    port: int
    database: str
    username: str
    password: str


class QueryPayload(BaseModel):
    query: str


JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")

# Predefined admin accounts
ADMIN_ACCOUNTS: Dict[str, Dict[str, str]] = {
    "admin@bank": {"password": "bank123", "sector": "bank", "role": "admin"},
    "admin@ithr": {"password": "ithr123", "sector": "ithr", "role": "admin"},
}


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def authenticate_token(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Access token required")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Invalid token")


# In-memory session store keyed by username
sessions: Dict[str, Dict[str, Any]] = {}


@app.middleware("http")
async def log_api_requests(request: Request, call_next):
    start = datetime.now(timezone.utc)
    path = request.url.path
    response = await call_next(request)
    duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    if path.startswith("/api"):
        try:
            # Read response body if it's JSONResponse
            body = getattr(response, "body", None)
            snippet = None
            if body:
                try:
                    snippet = json.loads(body)
                except Exception:
                    snippet = None
            log_line = f"{request.method} {path} {response.status_code} in {duration_ms}ms"
            if snippet:
                text = json.dumps(snippet)
                if len(text) > 80:
                    text = text[:79] + "…"
                log_line += f" :: {text}"
            print(log_line)
        except Exception:
            pass
    return response


@app.exception_handler(Exception)
async def exception_handler(_request: Request, exc: Exception):
    status = getattr(exc, "status_code", 500)
    message = getattr(exc, "detail", str(exc) or "Internal Server Error")
    return JSONResponse(status_code=status, content={"message": message})


@app.post("/api/login")
async def login(credentials: LoginCredentials):
    username = credentials.username
    password = credentials.password
    account = ADMIN_ACCOUNTS.get(username)
    if not account or account["password"] != password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    payload = {
        "username": username,
        "sector": account["sector"],
        "role": account["role"],
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"username": username, "sector": account["sector"], "role": account["role"]},
    }


@app.post("/api/connect-db")
async def connect_db(connection: DatabaseConnection, user=Depends(authenticate_token)):
    db_service = DatabaseConfigService.get_instance()
    connection_name = f"{user['username']}_{int(datetime.now().timestamp()*1000)}"

    result = await db_service.add_connection(
        user_id=user["username"],
        connection_id=connection_name,
        params=connection.model_dump(),
    )

    if result["success"]:
        session_key = user["username"]
        if sessions.get(session_key):
            print(f"Clearing previous session data for user {user['username']}")
            sessions.pop(session_key, None)

        actual_name = result.get("existingConnectionId") or connection_name
        sessions[session_key] = {
            "db_connection": connection.model_dump(),
            "schema": result["schema"],
            "connectionName": actual_name,
            "lastUpdated": datetime.utcnow().isoformat(),
        }

        suggested_kpis = await generate_kpi_suggestions(result["schema"], user["sector"])
        return {
            "status": "connected",
            "schema": result["schema"],
            "suggested_kpis": suggested_kpis,
            "connectionName": actual_name,
            "message": "Database connection updated (existing connection reused to avoid duplicates)"
            if result.get("isExisting")
            else "Database connected and schema extracted successfully",
        }
    raise HTTPException(status_code=400, detail=result.get("error") or "Failed to connect to database")


@app.get("/api/schema")
async def get_schema(user=Depends(authenticate_token)):
    session_key = user["username"]
    session = sessions.get(session_key)
    if not session:
        raise HTTPException(status_code=400, detail="No active database connection")
    schema = session["schema"]
    print(f"Serving schema for user {user['username']}: {len((schema.get('tables') or {}).keys())} tables")
    return {
        "schema": schema,
        "lastUpdated": session.get("lastUpdated"),
        "connectionName": session.get("connectionName"),
    }


@app.post("/api/query-kpi")
async def query_kpi(payload: QueryPayload, user=Depends(authenticate_token)):
    session_key = user["username"]
    if session_key not in sessions:
        raise HTTPException(status_code=400, detail="No active database connection")

    sql_query = await generate_sql_from_query(payload.query, sessions[session_key]["schema"], user["sector"])
    executor = QueryExecutor.get_instance()
    results = await executor.execute_query(sql_query, user["username"])
    return {
        "query": payload.query,
        "sql_query": sql_query,
        "results": results,
        "execution_time": results.get("execution_time"),
    }


@app.get("/api/database-config")
async def database_config(user=Depends(authenticate_token)):
    db_service = DatabaseConfigService.get_instance()
    current = db_service.get_current_connection(user["username"])
    all_connections = db_service.get_all_connections(user["username"]) or {}
    sanitized = []
    for key, val in all_connections.items():
        item = dict(val)
        item["id"] = key
        item["password"] = "***"
        sanitized.append(item)
    return {"success": True, "currentConnection": current, "connections": sanitized}


class SwitchPayload(BaseModel):
    connectionId: str


@app.post("/api/switch-database")
async def switch_database(payload: SwitchPayload, user=Depends(authenticate_token)):
    db_service = DatabaseConfigService.get_instance()
    ok = db_service.set_active_connection(user["username"], payload.connectionId)
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid connection ID")
    current = db_service.get_current_connection(user["username"]) or {}
    # Update session with new schema
    session_key = user["username"]
    if current and current.get("schema"):
        sessions[session_key] = {
            "db_connection": {
                "host": current.get("host"),
                "port": current.get("port"),
                "database": current.get("database"),
                "username": current.get("username"),
                "password": current.get("password"),
            },
            "schema": current.get("schema"),
            "connectionName": payload.connectionId,
        }
        print(
            f"Session updated for user {user['username']} with schema from database {current.get('database')}"
        )
    return {
        "success": True,
        "message": "Database connection switched successfully",
        "currentConnection": current,
    }


@app.delete("/api/database-connection/{connection_id}")
async def remove_database_connection(connection_id: str, user=Depends(authenticate_token)):
    db_service = DatabaseConfigService.get_instance()
    ok = db_service.remove_connection(user["username"], connection_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Connection not found or unable to remove")
    return {"success": True, "message": "Database connection removed successfully"}


@app.post("/api/logout")
async def logout(user=Depends(authenticate_token)):
    sessions.pop(user["username"], None)
    return {"status": "logged out"}


