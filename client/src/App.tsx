import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { setAuthToken, clearAuthToken } from "@/lib/api";
import Login from "@/components/Login";
import Dashboard from "@/components/Dashboard";
import ChatbotInterface from "@/components/ChatbotInterface";
import NotFound from "@/pages/not-found";
import { useState } from "react";
import { KPISuggestion } from "@/types";

function Router() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [currentView, setCurrentView] = useState<'dashboard' | 'chatbot'>('dashboard');
  const [suggestedKPIs, setSuggestedKPIs] = useState<KPISuggestion[]>([]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const handleLogin = (token: string, userData: any) => {
    setAuthToken(token);
    login(token, userData);
  };

  const handleLogout = async () => {
    try {
      // Call logout endpoint to clear server session
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear React Query cache to prevent data leakage between users
      queryClient.clear();
      clearAuthToken();
      logout();
      setCurrentView('dashboard');
    }
  };

  const handleDatabaseConnected = (kpiSuggestions?: KPISuggestion[]) => {
    if (kpiSuggestions) {
      setSuggestedKPIs(kpiSuggestions);
    }
    setCurrentView('chatbot');
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
  };

  if (!isAuthenticated || !user) {
    return <Login onLogin={handleLogin} />;
  }

  if (currentView === 'chatbot') {
    return (
      <ChatbotInterface 
        user={user}
        onBack={handleBackToDashboard}
        onLogout={handleLogout}
        suggestedKPIs={suggestedKPIs}
      />
    );
  }

  return (
    <Dashboard 
      user={user}
      onLogout={handleLogout}
      onDatabaseConnected={handleDatabaseConnected}
    />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
