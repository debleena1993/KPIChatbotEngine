import { apiRequest } from "./queryClient";
import { LoginCredentials, DatabaseConnection, User, Schema, KPISuggestion, QueryResult } from "@/types";

const API_BASE = "/api";

// Auth token storage
let authToken: string | null = localStorage.getItem('authToken');

export const setAuthToken = (token: string) => {
  authToken = token;
  localStorage.setItem('authToken', token);
};

export const clearAuthToken = () => {
  authToken = null;
  localStorage.removeItem('authToken');
};

export const getAuthHeaders = () => {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
};

// Enhanced API request with auth headers
export const authenticatedRequest = async (method: string, url: string, data?: any) => {
  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (authHeaders.Authorization) {
    headers.Authorization = authHeaders.Authorization;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status}: ${errorText}`);
  }

  return response;
};

export const authAPI = {
  login: async (credentials: LoginCredentials) => {
    const response = await apiRequest("POST", `${API_BASE}/login`, credentials);
    return response.json();
  },

  logout: async () => {
    const response = await authenticatedRequest("POST", `${API_BASE}/logout`);
    return response.json();
  }
};

export const databaseAPI = {
  connect: async (connection: DatabaseConnection) => {
    const response = await authenticatedRequest("POST", `${API_BASE}/connect-db`, connection);
    return response.json();
  },

  getSchema: async (): Promise<{ schema: Schema }> => {
    const response = await authenticatedRequest("GET", `${API_BASE}/schema`);
    return response.json();
  }
};

export const chatAPI = {
  queryKPI: async (query: string): Promise<QueryResult> => {
    const response = await authenticatedRequest("POST", `${API_BASE}/query-kpi`, { query });
    return response.json();
  }
};
