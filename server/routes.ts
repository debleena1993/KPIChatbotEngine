import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { z } from "zod";
import { DatabaseConfigService } from "./services/database-config";
import { generateKPISuggestions as generateAIKPISuggestions, generateSQLFromQuery } from "./services/gemini";
import { QueryExecutor } from "./services/query-executor";


// Extend Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// JWT secret - in production this should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";

// Predefined admin accounts
const ADMIN_ACCOUNTS = {
  "admin@bank": {
    password: "bank123",
    sector: "bank" as const,
    role: "admin"
  },
  "admin@ithr": {
    password: "ithr123",
    sector: "ithr" as const,
    role: "admin"
  }
};

// Session storage (in production, use Redis)
const sessions: Record<string, any> = {};

// Request schemas
const loginSchema = z.object({
  username: z.string(),
  password: z.string()
});

const dbConnectionSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  username: z.string(),
  password: z.string()
});

const querySchema = z.object({
  query: z.string()
});

// Auth middleware
const authenticateToken = (req: Request, res: Response, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Login endpoint
  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = loginSchema.parse(req.body);
      
      const account = ADMIN_ACCOUNTS[username as keyof typeof ADMIN_ACCOUNTS];
      if (!account || account.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { 
          username, 
          sector: account.sector, 
          role: account.role 
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.json({
        access_token: token,
        token_type: "bearer",
        user: {
          username,
          sector: account.sector,
          role: account.role
        }
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Database connection endpoint with automatic config update
  app.post("/api/connect-db", authenticateToken, async (req: Request, res: Response) => {
    try {
      const connectionData = dbConnectionSchema.parse(req.body);
      const user = req.user;
      const dbService = DatabaseConfigService.getInstance();
      
      // Create unique connection name for this user session
      const connectionName = `${user.username}_${Date.now()}`;
      
      // Test connection and extract schema with user-specific storage
      const result = await dbService.addConnection(user.username, connectionName, {
        host: connectionData.host,
        port: connectionData.port,
        database: connectionData.database,
        username: connectionData.username,
        password: connectionData.password
      });

      if (result.success) {
        // Clear any previous session data to ensure fresh schema
        const sessionKey = user.username;
        if (sessions[sessionKey]) {
          console.log(`Clearing previous session data for user ${user.username}`);
          delete sessions[sessionKey];
        }
        
        // Store fresh session data
        const actualConnectionName = result.existingConnectionId || connectionName;
        sessions[sessionKey] = {
          db_connection: connectionData,
          schema: result.schema, // This is the fresh schema from the new connection
          connectionName: actualConnectionName,
          lastUpdated: new Date().toISOString()
        };
        
        console.log(`Session created/updated for user ${user.username} with fresh schema from database ${connectionData.database}`);
        console.log(`Schema contains ${Object.keys(result.schema.tables || {}).length} tables`);

        // Generate AI-powered KPI suggestions based on fresh schema and sector
        const suggestedKPIs = await generateAIKPISuggestions(result.schema, user.sector);

        res.json({
          status: "connected",
          schema: result.schema,
          suggested_kpis: suggestedKPIs,
          connectionName: actualConnectionName,
          message: result.isExisting 
            ? "Database connection updated (existing connection reused to avoid duplicates)"
            : "Database connected and schema extracted successfully"
        });
      } else {
        res.status(400).json({ 
          message: result.error || "Failed to connect to database" 
        });
      }
    } catch (error) {
      console.error("Database connection error:", error);
      res.status(500).json({ 
        message: "Internal server error while connecting to database" 
      });
    }
  });

  // Get schema endpoint
  app.get("/api/schema", authenticateToken, async (req: Request, res: Response) => {
    const sessionKey = req.user.username;
    if (!sessions[sessionKey]) {
      return res.status(400).json({ message: "No active database connection" });
    }
    
    const schema = sessions[sessionKey].schema;
    console.log(`Serving schema for user ${req.user.username}: ${Object.keys(schema.tables || {}).length} tables`);
    
    res.json({ 
      schema: schema,
      lastUpdated: sessions[sessionKey].lastUpdated,
      connectionName: sessions[sessionKey].connectionName
    });
  });

  // Query KPI endpoint
  app.post("/api/query-kpi", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { query } = querySchema.parse(req.body);
      const user = req.user;
      const sessionKey = user.username;
      
      if (!sessions[sessionKey]) {
        return res.status(400).json({ message: "No active database connection" });
      }

      // Generate AI-powered SQL query
      const sqlQuery = await generateSQLFromQuery(query, sessions[sessionKey].schema, user.sector);
      
      // Execute the actual SQL query against the connected database
      const queryExecutor = QueryExecutor.getInstance();
      const results = await queryExecutor.executeQuery(sqlQuery, user.username);

      res.json({
        query,
        sql_query: sqlQuery,
        results,
        execution_time: results.execution_time
      });
    } catch (error) {
      console.error("Query execution error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Query execution failed" 
      });
    }
  });

  // Get current database configuration - user-specific
  app.get("/api/database-config", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const dbService = DatabaseConfigService.getInstance();
      const currentConnection = dbService.getCurrentConnection(user.username);
      const allConnections = dbService.getAllConnections(user.username);

      res.json({
        success: true,
        currentConnection,
        connections: Object.keys(allConnections).map(key => ({
          id: key,
          ...allConnections[key],
          // Don't send password in response
          password: "***"
        }))
      });
    } catch (error) {
      console.error("Error getting database config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get database configuration"
      });
    }
  });

  // Switch active database connection - user-specific
  app.post("/api/switch-database", authenticateToken, async (req: Request, res: Response) => {
    const switchSchema = z.object({
      connectionId: z.string()
    });

    try {
      const { connectionId } = switchSchema.parse(req.body);
      const user = req.user;
      const dbService = DatabaseConfigService.getInstance();
      
      const success = dbService.setActiveConnection(user.username, connectionId);
      
      if (success) {
        const currentConnection = dbService.getCurrentConnection(user.username);
        
        // Update session data with the new connection's schema
        const sessionKey = user.username;
        if (currentConnection && currentConnection.schema) {
          sessions[sessionKey] = {
            db_connection: {
              host: currentConnection.host,
              port: currentConnection.port,
              database: currentConnection.database,
              username: currentConnection.username,
              password: currentConnection.password
            },
            schema: currentConnection.schema,
            connectionName: connectionId
          };
          
          console.log(`Session updated for user ${user.username} with schema from database ${currentConnection.database}`);
        }
        
        res.json({
          success: true,
          message: "Database connection switched successfully",
          currentConnection
        });
      } else {
        res.status(400).json({
          success: false,
          error: "Invalid connection ID"
        });
      }
    } catch (error) {
      console.error("Error switching database:", error);
      res.status(500).json({
        success: false,
        error: "Failed to switch database connection"
      });
    }
  });

  // Remove database connection - user-specific
  app.delete("/api/database-connection/:connectionId", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { connectionId } = req.params;
      const user = req.user;
      const dbService = DatabaseConfigService.getInstance();
      
      const success = dbService.removeConnection(user.username, connectionId);
      
      if (success) {
        res.json({
          success: true,
          message: "Database connection removed successfully"
        });
      } else {
        res.status(400).json({
          success: false,
          error: "Connection not found or unable to remove"
        });
      }
    } catch (error) {
      console.error("Error removing database connection:", error);
      res.status(500).json({
        success: false,
        error: "Failed to remove database connection"
      });
    }
  });

  // Logout endpoint
  app.post("/api/logout", authenticateToken, async (req: Request, res: Response) => {
    const sessionKey = req.user.username;
    if (sessions[sessionKey]) {
      delete sessions[sessionKey];
    }
    res.json({ status: "logged out" });
  });

  const httpServer = createServer(app);
  return httpServer;
}



function generateMockSQL(query: string, sector: string): string {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes("salary") || lowerQuery.includes("employee")) {
    return "SELECT department, AVG(salary) as avg_salary, COUNT(*) as employee_count FROM employees GROUP BY department ORDER BY avg_salary DESC LIMIT 10;";
  } else if (lowerQuery.includes("transaction") || lowerQuery.includes("volume")) {
    return "SELECT DATE(transaction_date) as date, SUM(amount) as total_amount, COUNT(*) as transaction_count FROM transactions WHERE transaction_date >= NOW() - INTERVAL '30 days' GROUP BY DATE(transaction_date) ORDER BY date;";
  } else if (lowerQuery.includes("department") || lowerQuery.includes("count")) {
    return "SELECT department, COUNT(*) as employee_count FROM employees GROUP BY department ORDER BY employee_count DESC;";
  } else {
    return "SELECT * FROM employees LIMIT 10;";
  }
}

function generateMockResults(query: string, sector: string) {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes("salary") || lowerQuery.includes("employee")) {
    return {
      table_data: [
        { department: "Engineering", avg_salary: 95000, employee_count: 25 },
        { department: "Sales", avg_salary: 75000, employee_count: 18 },
        { department: "Marketing", avg_salary: 68000, employee_count: 12 },
        { department: "HR", avg_salary: 62000, employee_count: 8 },
        { department: "Finance", avg_salary: 78000, employee_count: 10 }
      ],
      chart_data: {
        type: "bar" as const,
        data: [
          { department: "Engineering", avg_salary: 95000 },
          { department: "Sales", avg_salary: 75000 },
          { department: "Marketing", avg_salary: 68000 },
          { department: "HR", avg_salary: 62000 },
          { department: "Finance", avg_salary: 78000 }
        ],
        xAxis: "department",
        yAxis: "avg_salary"
      },
      columns: ["department", "avg_salary", "employee_count"],
      row_count: 5,
      execution_time: 0.15
    };
  } else if (lowerQuery.includes("transaction") || lowerQuery.includes("volume")) {
    return {
      table_data: [
        { date: "2024-01-15", total_amount: 125000, transaction_count: 45 },
        { date: "2024-01-16", total_amount: 138000, transaction_count: 52 },
        { date: "2024-01-17", total_amount: 142000, transaction_count: 48 },
        { date: "2024-01-18", total_amount: 159000, transaction_count: 61 },
        { date: "2024-01-19", total_amount: 134000, transaction_count: 43 }
      ],
      chart_data: {
        type: "line" as const,
        data: [
          { date: "2024-01-15", total_amount: 125000 },
          { date: "2024-01-16", total_amount: 138000 },
          { date: "2024-01-17", total_amount: 142000 },
          { date: "2024-01-18", total_amount: 159000 },
          { date: "2024-01-19", total_amount: 134000 }
        ],
        xAxis: "date",
        yAxis: "total_amount"
      },
      columns: ["date", "total_amount", "transaction_count"],
      row_count: 5,
      execution_time: 0.12
    };
  } else if (lowerQuery.includes("department") || lowerQuery.includes("count")) {
    return {
      table_data: [
        { department: "Engineering", employee_count: 25 },
        { department: "Sales", employee_count: 18 },
        { department: "Marketing", employee_count: 12 },
        { department: "Finance", employee_count: 10 },
        { department: "HR", employee_count: 8 }
      ],
      chart_data: {
        type: "pie" as const,
        data: [
          { department: "Engineering", employee_count: 25 },
          { department: "Sales", employee_count: 18 },
          { department: "Marketing", employee_count: 12 },
          { department: "Finance", employee_count: 10 },
          { department: "HR", employee_count: 8 }
        ],
        xAxis: "department",
        yAxis: "employee_count"
      },
      columns: ["department", "employee_count"],
      row_count: 5,
      execution_time: 0.08
    };
  } else {
    return {
      table_data: [
        { id: 1, name: "John Doe", department: "Engineering", salary: 95000 },
        { id: 2, name: "Jane Smith", department: "Sales", salary: 75000 },
        { id: 3, name: "Bob Johnson", department: "Marketing", salary: 68000 }
      ],
      chart_data: {
        type: "bar" as const,
        data: [
          { name: "John Doe", salary: 95000 },
          { name: "Jane Smith", salary: 75000 },
          { name: "Bob Johnson", salary: 68000 }
        ],
        xAxis: "name",
        yAxis: "salary"
      },
      columns: ["id", "name", "department", "salary"],
      row_count: 3,
      execution_time: 0.05
    };
  }
}
