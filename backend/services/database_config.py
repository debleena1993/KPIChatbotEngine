import asyncio
import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Optional

import psycopg


# Resolve to backend/config/database.json regardless of CWD
CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "database.json"


@dataclass
class DatabaseConnection:
    host: str
    port: int
    database: str
    username: str
    password: str
    type: str = "postgresql"
    isActive: bool = False
    schema: Optional[Dict[str, Any]] = None
    lastConnected: Optional[str] = None


class DatabaseConfigService:
    _instance: "DatabaseConfigService | None" = None

    def __init__(self) -> None:
        self.config: Dict[str, Any] = {}
        self._load_config()

    @classmethod
    def get_instance(cls) -> "DatabaseConfigService":
        if cls._instance is None:
            cls._instance = DatabaseConfigService()
        return cls._instance

    def _load_config(self) -> None:
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                self.config = json.load(f)
            # migrate if needed
            if "currentConnection" in self.config and "connections" in self.config:
                self.config = {
                    "users": {
                        "migration": {
                            "currentConnection": self.config.get("currentConnection"),
                            "connections": self.config.get("connections", {}),
                        }
                    }
                }
                self._save_config()
        except Exception:
            self.config = {"users": {}}
            CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            self._save_config()

    def _save_config(self) -> None:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(self.config, f, indent=2)

    async def test_connection(self, params: Dict[str, Any]) -> bool:
        requires_ssl = any(
            host in params["host"]
            for host in ["neon.tech", "supabase.", "amazonaws.com", "planetscale.", "railway."]
        )
        conninfo = psycopg.conninfo.make_conninfo(
            host=params["host"],
            port=params["port"],
            dbname=params["database"],
            user=params["username"],
            password=params["password"],
            sslmode="require" if requires_ssl else "disable",
        )
        try:
            async with await psycopg.AsyncConnection.connect(conninfo) as aconn:
                async with aconn.cursor() as cur:
                    await cur.execute("SELECT 1")
                    await cur.fetchone()
            return True
        except Exception as e:
            print("Database connection test failed:", e)
            return False

    async def extract_schema(self, params: Dict[str, Any]) -> Dict[str, Any]:
        requires_ssl = any(
            host in params["host"]
            for host in ["neon.tech", "supabase.", "amazonaws.com", "planetscale.", "railway."]
        )
        conninfo = psycopg.conninfo.make_conninfo(
            host=params["host"],
            port=params["port"],
            dbname=params["database"],
            user=params["username"],
            password=params["password"],
            sslmode="require" if requires_ssl else "disable",
        )
        tables: list[dict[str, Any]] = []
        async with await psycopg.AsyncConnection.connect(conninfo) as aconn:
            async with aconn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT table_name, table_schema
                    FROM information_schema.tables
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                    ORDER BY table_name;
                    """
                )
                for table_name, table_schema in await cur.fetchall():
                    await cur.execute(
                        """
                        SELECT column_name, data_type, is_nullable, column_default,
                               character_maximum_length, numeric_precision, numeric_scale
                        FROM information_schema.columns
                        WHERE table_name = %s AND table_schema = %s
                        ORDER BY ordinal_position;
                        """,
                        (table_name, table_schema),
                    )
                    cols = await cur.fetchall()
                    columns = []
                    for (
                        column_name,
                        data_type,
                        is_nullable,
                        column_default,
                        character_maximum_length,
                        numeric_precision,
                        numeric_scale,
                    ) in cols:
                        columns.append(
                            {
                                "name": column_name,
                                "type": data_type,
                                "nullable": is_nullable == "YES",
                                "default": column_default,
                                "maxLength": character_maximum_length,
                                "precision": numeric_precision,
                                "scale": numeric_scale,
                            }
                        )
                    tables.append(
                        {"name": table_name, "schema": table_schema, "columns": columns}
                    )

        formatted: Dict[str, Any] = {}
        for table in tables:
            cols = {}
            for col in table["columns"]:
                cols[col["name"]] = {
                    "type": col["type"],
                    "nullable": col["nullable"],
                    "default": col["default"],
                }
            formatted[table["name"]] = {"columns": cols}

        return {
            "tables": formatted,
            "extractedAt": __import__("datetime").datetime.utcnow().isoformat(),
            "totalTables": len(tables),
            "rawTables": tables,
        }

    def _find_existing_connection(self, user_id: str, params: Dict[str, Any]) -> Optional[str]:
        if not self.config.get("users", {}).get(user_id, {}).get("connections"):
            return None
        for cid, conn in self.config["users"][user_id]["connections"].items():
            if (
                conn.get("host") == params["host"]
                and conn.get("port") == params["port"]
                and conn.get("database") == params["database"]
                and conn.get("username") == params["username"]
            ):
                return cid
        return None

    async def add_connection(
        self, user_id: str, connection_id: str, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        is_valid = await self.test_connection(params)
        if not is_valid:
            return {
                "success": False,
                "error": "Failed to connect to database with provided credentials",
            }

        self.config.setdefault("users", {})
        self.config["users"].setdefault(user_id, {"currentConnection": None, "connections": {}})

        existing_id = self._find_existing_connection(user_id, params)
        if existing_id:
            for key in list(self.config["users"][user_id]["connections"].keys()):
                self.config["users"][user_id]["connections"][key]["isActive"] = False
            schema = await self.extract_schema(params)
            self.config["users"][user_id]["connections"][existing_id] = {
                **params,
                "type": "postgresql",
                "isActive": True,
                "schema": schema,
                "lastConnected": __import__("datetime").datetime.utcnow().isoformat(),
            }
            self.config["users"][user_id]["currentConnection"] = existing_id
            self._save_config()
            return {"success": True, "schema": schema, "isExisting": True, "existingConnectionId": existing_id}

        schema = await self.extract_schema(params)
        for key in list(self.config["users"][user_id]["connections"].keys()):
            self.config["users"][user_id]["connections"][key]["isActive"] = False
        self.config["users"][user_id]["connections"][connection_id] = {
            **params,
            "type": "postgresql",
            "isActive": True,
            "schema": schema,
            "lastConnected": __import__("datetime").datetime.utcnow().isoformat(),
        }
        self.config["users"][user_id]["currentConnection"] = connection_id
        self._save_config()
        return {"success": True, "schema": schema}

    def get_current_connection(self, user_id: str) -> Optional[Dict[str, Any]]:
        user = self.config.get("users", {}).get(user_id)
        if not user or not user.get("currentConnection"):
            return None
        return user["connections"].get(user["currentConnection"])

    def get_all_connections(self, user_id: str) -> Dict[str, Any]:
        self._cleanup_duplicates(user_id)
        return self.config.get("users", {}).get(user_id, {}).get("connections", {})

    def _cleanup_duplicates(self, user_id: str) -> None:
        user = self.config.get("users", {}).get(user_id)
        if not user:
            return
        connections = user.get("connections", {})
        seen = set()
        to_remove: list[str] = []
        for cid, conn in connections.items():
            identifier = f"{conn.get('host')}:{conn.get('port')}:{conn.get('database')}:{conn.get('username')}"
            if identifier in seen:
                to_remove.append(cid)
            else:
                seen.add(identifier)
        changed = False
        for cid in to_remove:
            connections.pop(cid, None)
            changed = True
            if user.get("currentConnection") == cid:
                remaining = list(connections.keys())
                user["currentConnection"] = remaining[0] if remaining else None
                if remaining:
                    connections[remaining[0]]["isActive"] = True
        if changed:
            self._save_config()

    def set_active_connection(self, user_id: str, connection_id: str) -> bool:
        user = self.config.get("users", {}).get(user_id)
        if not user or connection_id not in user.get("connections", {}):
            return False
        for key in list(user["connections"].keys()):
            user["connections"][key]["isActive"] = False
        user["connections"][connection_id]["isActive"] = True
        user["currentConnection"] = connection_id
        self._save_config()
        return True

    def remove_connection(self, user_id: str, connection_id: str) -> bool:
        user = self.config.get("users", {}).get(user_id)
        if not user or connection_id not in user.get("connections", {}):
            return False
        user["connections"].pop(connection_id, None)
        if user.get("currentConnection") == connection_id:
            remaining = list(user["connections"].keys())
            user["currentConnection"] = remaining[0] if remaining else None
            if remaining:
                user["connections"][remaining[0]]["isActive"] = True
        self._save_config()
        return True


