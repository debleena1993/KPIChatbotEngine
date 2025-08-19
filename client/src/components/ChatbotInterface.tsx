import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { chatAPI, databaseAPI } from "@/lib/api";
import { User, Schema, KPISuggestion, ChatMessage } from "@/types";
import { 
  Bot, 
  User as UserIcon, 
  Send, 
  ArrowLeft, 
  Database, 
  BarChart3, 
  LogOut,
  Trash2,
  Copy,
  Download
} from "lucide-react";
import ResultsDisplay from "./ResultsDisplay";
import pwcLogo from "@assets/PwC_fl_c.png";

interface ChatbotInterfaceProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
  suggestedKPIs?: KPISuggestion[];
}

export default function ChatbotInterface({ user, onBack, onLogout, suggestedKPIs: initialKPIs }: ChatbotInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [suggestedKPIs, setSuggestedKPIs] = useState<KPISuggestion[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Load schema and add welcome message
    loadSchema();
    addWelcomeMessage();
    
    // If we have initial KPIs from database connection, use them
    if (initialKPIs && initialKPIs.length > 0) {
      setSuggestedKPIs(initialKPIs);
    }
  }, [initialKPIs]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadSchema = async () => {
    try {
      const response = await databaseAPI.getSchema();
      setSchema(response.schema);
      
      // Only generate hardcoded suggestions if we don't have AI-generated ones
      if (!initialKPIs || initialKPIs.length === 0) {
        generateKPISuggestions(response.schema);
      }
    } catch (error) {
      toast({
        title: "Failed to load schema",
        description: "Could not load database schema. Please reconnect.",
        variant: "destructive"
      });
    }
  };

  const generateKPISuggestions = (schema: Schema) => {
    const suggestions: KPISuggestion[] = [];
    
    // Generate suggestions based on sector and available tables
    const tables = Object.keys(schema.tables);
    
    if (user.sector === "bank") {
      suggestions.push(
        { id: "account_balance", name: "Account Balances", description: "Total account balances by type", query_template: "Show me account balances by account type" },
        { id: "transaction_volume", name: "Transaction Volume", description: "Daily transaction volumes", query_template: "Show me daily transaction volumes for the last month" },
        { id: "loan_performance", name: "Loan Performance", description: "Loan approval rates and amounts", query_template: "What's the loan approval rate this quarter?" }
      );
    } else if (user.sector === "finance") {
      suggestions.push(
        { id: "revenue_trends", name: "Revenue Trends", description: "Revenue trends over time", query_template: "Show me quarterly revenue trends" },
        { id: "client_portfolio", name: "Client Portfolio", description: "Client portfolio values", query_template: "Show me client portfolio distribution" },
        { id: "profit_margins", name: "Profit Margins", description: "Profit margins by service", query_template: "What are the profit margins by service type?" }
      );
    } else if (user.sector === "ithr") {
      suggestions.push(
        { id: "employee_count", name: "Employee Count", description: "Employee headcount by department", query_template: "Show me employee count by department" },
        { id: "salary_analysis", name: "Salary Analysis", description: "Average salary by role", query_template: "What's the average salary by job title?" },
        { id: "performance_ratings", name: "Performance Ratings", description: "Employee performance distribution", query_template: "Show me performance rating distributions" }
      );
    }

    // Add generic suggestions based on table names
    tables.forEach(tableName => {
      suggestions.push({
        id: `${tableName}_summary`,
        name: `${tableName.charAt(0).toUpperCase() + tableName.slice(1)} Summary`,
        description: `Summary statistics from ${tableName} table`,
        query_template: `Show me a summary of ${tableName} data`
      });
    });

    setSuggestedKPIs(suggestions.slice(0, 5));
  };

  const addWelcomeMessage = () => {
    const welcomeMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "assistant",
      content: "Hello! I'm your KPI assistant. I can help you analyze your data using natural language queries. Try asking something like 'Show me monthly sales for the last 6 months' or 'What's the average salary by department?'",
      timestamp: new Date()
    };
    setMessages([welcomeMessage]);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const result = await chatAPI.queryKPI(inputMessage.trim());
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: `Here are the results for your query: "${userMessage.content}"`,
        timestamp: new Date(),
        results: result
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: `I'm sorry, I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}. Please try rephrasing your query or check your database connection.`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Query failed",
        description: error instanceof Error ? error.message : "Could not process your query",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickQuery = (query: string) => {
    setInputMessage(query);
  };

  const clearChat = () => {
    setMessages([]);
    addWelcomeMessage();
  };

  const getSectorColor = (sector: string) => {
    switch (sector) {
      case 'bank': return 'text-[#FD5108]';
      case 'finance': return 'text-[#A1A8B3]';
      case 'ithr': return 'text-[#FE7C39]';
      default: return 'text-[#FD5108]';
    }
  };

  const getSectorName = (sector: string) => {
    switch (sector) {
      case 'bank': return 'Banking';
      case 'finance': return 'Finance';
      case 'ithr': return 'HR Portal';
      default: return sector;
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F8] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-[#DFE3E6] px-6 py-4 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="sm"
              data-testid="button-back"
              onClick={onBack}
              className="mr-4 text-[#A1A8B3] hover:text-[#1A1A1A] hover:bg-[#FFE8D4]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="mr-4">
              <img 
                src={pwcLogo} 
                alt="PWC Logo" 
                className="h-10 w-auto object-contain"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1A1A1A]">KPI Chatbot</h1>
              <p className="text-sm text-[#A1A8B3]">
                Connected to database • 
                <span className="text-[#FD5108] ml-1">
                  <span className="inline-block w-1 h-1 bg-[#FD5108] rounded-full mr-1"></span>
                  Online
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              data-testid="button-toggle-schema"
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-[#A1A8B3] hover:text-[#1A1A1A] hover:bg-[#FFE8D4]"
            >
              <Database className="mr-2 h-4 w-4" />
              Schema
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              data-testid="button-logout-chat"
              onClick={onLogout}
              className="text-[#A1A8B3] hover:text-[#1A1A1A] hover:bg-[#FFE8D4]"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-7xl mx-auto w-full">
        {/* Sidebar */}
        {showSidebar && (
          <aside className="w-80 bg-white border-r border-[#DFE3E6] overflow-y-auto flex-shrink-0">
            {/* Schema Panel */}
            <div className="p-4 border-b border-[#DFE3E6]" style={{display:'none'}}>
              <h3 className="font-semibold text-[#1A1A1A] mb-3 flex items-center">
                <Database className="mr-2 h-4 w-4 text-[#FD5108]" />
                Database Schema
              </h3>
              
              {schema && (
                <div className="space-y-2 text-sm">
                  {Object.entries(schema.tables).map(([tableName, tableInfo]) => (
                    <div key={tableName} className="p-2 bg-[#F5F7F8] rounded-lg">
                      <div className="font-medium text-[#1A1A1A] mb-1">{tableName}</div>
                      <div className="text-xs text-[#A1A8B3] ml-2 space-y-1">
                        {Object.entries(tableInfo.columns).slice(0, 5).map(([colName, colInfo]) => (
                          <div key={colName}>• {colName} ({colInfo.type})</div>
                        ))}
                        {Object.keys(tableInfo.columns).length > 5 && (
                          <div className="text-[#CBD1D6]">... and {Object.keys(tableInfo.columns).length - 5} more</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* KPI Panel */}
            <div className="p-4" style={{height:'90vh',overflow:'auto'}}>
              <h3 className="font-semibold text-[#1A1A1A] mb-3 flex items-center">
                <BarChart3 className="mr-2 h-4 w-4 text-[#FD5108]" />
                Suggested KPIs
              </h3>
              
              <div className="space-y-2 text-sm">
                {suggestedKPIs.map((kpi) => (
                  <button
                    key={kpi.id}
                    data-testid={`kpi-suggestion-${kpi.id}`}
                    onClick={() => handleQuickQuery(kpi.query_template)}
                    className="w-full text-left p-3 bg-[#F5F7F8] hover:bg-[#FFE8D4] rounded-lg transition-colors group border border-transparent hover:border-[#FD5108]"
                  >
                    <div className="font-medium text-[#1A1A1A] group-hover:text-[#FD5108]">{kpi.name}</div>
                    <div className="text-xs text-[#A1A8B3] mt-1">{kpi.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* Main Chat Area */}
        <main className="flex-1 flex flex-col" style={{height: '90vh',
                                                      overflow: 'auto'}}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                data-testid={`message-${message.type}-${message.id}`}
                className={`flex items-start space-x-3 ${
                  message.type === "user" ? "justify-end" : ""
                }`}
              >
                {message.type === "assistant" && (
                  <div className="bg-[#FD5108] text-white w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-3xl ${
                    message.type === "user"
                      ? "bg-[#FD5108] text-white p-4 rounded-2xl rounded-tr-none"
                      : "bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-[#DFE3E6]"
                  }`}
                >
                  <p className={message.type === "user" ? "text-white" : "text-[#1A1A1A]"}>
                    {message.content}
                  </p>
                  
                  {message.results && (
                    <div className="mt-4">
                      <ResultsDisplay results={message.results} />
                    </div>
                  )}
                </div>

                {message.type === "user" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-[#A1A8B3] text-white">
                    <UserIcon className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start space-x-3">
                <div className="bg-[#FD5108] text-white w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-[#DFE3E6]">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#FD5108]"></div>
                    <span className="text-[#A1A8B3]">Processing your query...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <div className="border-t border-[#DFE3E6] bg-white p-4 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-end space-x-3">
                <div className="flex-1">
                  <div className="relative">
                    <Textarea
                      data-testid="input-chat-message"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Ask me anything about your KPIs... (e.g., 'Show monthly revenue trends' or 'Which department has the highest average salary?')"
                      className="w-full p-4 pr-12 border border-[#DFE3E6] rounded-2xl focus:ring-2 focus:ring-[#FD5108] focus:border-transparent resize-none min-h-[60px] max-h-32 text-[#1A1A1A] placeholder:text-[#A1A8B3]"
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button
                      data-testid="button-send-message"
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isLoading}
                      className="absolute right-3 bottom-3 bg-[#FD5108] hover:bg-[#E8490A] text-white w-8 h-8 p-0 rounded-full border-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center space-x-2 mt-2" style={{display:'none'}}>
                    <span className="text-xs text-gray-500">Quick actions:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="quick-action-monthly-sales"
                      onClick={() => handleQuickQuery("Show me monthly sales")}
                      className="text-xs h-6"
                    >
                      Monthly Sales
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="quick-action-top-customers"
                      onClick={() => handleQuickQuery("Show me top customers")}
                      className="text-xs h-6"
                    >
                      Top Customers
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="quick-action-dept-average"
                      onClick={() => handleQuickQuery("Show me department averages")}
                      className="text-xs h-6"
                    >
                      Dept. Average
                    </Button>
                  </div>
                </div>

                <Button
                  style={{display:'none'}}
                  variant="outline"
                  size="sm"
                  data-testid="button-clear-chat"
                  onClick={clearChat}
                  className="h-12"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
