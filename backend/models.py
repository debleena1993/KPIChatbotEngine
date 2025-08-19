"""
Pydantic models for request/response validation
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum

class SectorEnum(str, Enum):
    BANK = "bank"
    ITHR = "ithr"

class RoleEnum(str, Enum):
    ADMIN = "admin"

# Request Models
class LoginRequest(BaseModel):
    username: str = Field(..., description="Username for authentication")
    password: str = Field(..., description="Password for authentication")

class DatabaseConnectionRequest(BaseModel):
    host: str = Field(..., description="Database host")
    port: int = Field(..., description="Database port")
    database: str = Field(..., description="Database name")
    username: str = Field(..., description="Database username")
    password: str = Field(..., description="Database password")

class KPIQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language KPI query")

# Response Models
class User(BaseModel):
    username: str
    sector: SectorEnum
    role: RoleEnum

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

class KPISuggestion(BaseModel):
    id: str
    name: str
    description: str
    query_template: str
    category: str

class DatabaseConnectionResponse(BaseModel):
    message: str
    schema_data: Dict[str, Any]
    connection_name: str
    suggestions: List[KPISuggestion]

class ChartConfig(BaseModel):
    type: str
    x_axis: str
    y_axis: str

class ChartDataPoint(BaseModel):
    name: str
    value: float

class KPIQueryResponse(BaseModel):
    query: str
    sql_query: str
    data: List[Dict[str, Any]]
    columns: List[str]
    chart_data: Optional[List[ChartDataPoint]] = None
    chart_config: Optional[ChartConfig] = None

class DatabaseConfigResponse(BaseModel):
    databases: List[Dict[str, Any]]

class MessageResponse(BaseModel):
    message: str

class HealthResponse(BaseModel):
    status: str
    service: str