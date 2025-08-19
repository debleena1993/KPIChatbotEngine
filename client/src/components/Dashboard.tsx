import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Database,
  Shield,
  Bot,
  LogOut,
  Activity,
} from "lucide-react";
import { User, KPISuggestion } from "@/types";
import DatabaseModal from "./DatabaseModal";
import DatabaseConfig from "./DatabaseConfig";
import pwcLogo from "@assets/PwC_fl_c.png";

interface DashboardProps {
  user: User;
  onLogout: () => void;
  onDatabaseConnected: (kpiSuggestions?: KPISuggestion[]) => void;
}

export default function Dashboard({
  user,
  onLogout,
  onDatabaseConnected,
}: DashboardProps) {
  const [isDatabaseModalOpen, setIsDatabaseModalOpen] = useState(false);

  const getSectorColor = (sector: string) => {
    switch (sector) {
      case "bank":
        return "text-[#FD5108]";
      case "finance":
        return "text-[#A1A8B3]";
      case "ithr":
        return "text-[#FE7C39]";
      default:
        return "text-[#FD5108]";
    }
  };

  const getSectorName = (sector: string) => {
    switch (sector) {
      case "bank":
        return "Banking Sector";
      case "finance":
        return "Finance Sector";
      case "ithr":
        return "HR Portal";
      default:
        return sector;
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F8]">
      {/* Header */}
      <header className="bg-white border-b border-[#DFE3E6] px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center">
            <div className="mr-4">
              <img
                src={pwcLogo}
                alt="PWC Logo"
                className="h-10 w-auto object-contain"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1A1A1A]">
                KPI Analytics Portal
              </h1>
              <p className="text-sm text-[#A1A8B3]">
                <span className={`font-medium ${getSectorColor(user.sector)}`}>
                  {getSectorName(user.sector)}
                </span>{" "}
                •<span className="ml-1">{user.username}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* User Info */}
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-[#FD5108] rounded-full"></div>
              <span className="text-sm text-[#A1A8B3]">{user.username}</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              data-testid="button-logout"
              onClick={onLogout}
              className="text-[#A1A8B3] hover:text-[#1A1A1A] hover:bg-[#FFE8D4]"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        {/* Welcome Section */}
        <Card className="mb-6 border-[#DFE3E6]">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2">
              Welcome to your Dashboard
            </h2>
            <p className="text-[#A1A8B3] mb-6">
              Connect to your database to start analyzing KPIs with our
              AI-powered chatbot.
            </p>

            {/* Database Connection Card */}
            <div className="bg-gradient-to-r from-[#FD5108] to-[#E8490A] text-white rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    Database Connection
                  </h3>
                  <p className="text-[#FFE8D4]">
                    Connect to your database to enable KPI analysis
                  </p>
                </div>
                <Button
                  data-testid="button-connect-database"
                  onClick={() => setIsDatabaseModalOpen(true)}
                  className="bg-white text-[#FD5108] hover:bg-[#FFF5ED] font-semibold shadow-lg border-0"
                >
                  <Database className="mr-2 h-4 w-4" />
                  Connect Database
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="border-[#DFE3E6]">
            <CardContent className="p-6">
              <div className="bg-[#FFE8D4] w-12 h-12 rounded-xl flex items-center justify-center mb-4">
                <Shield className="text-[#FD5108] h-6 w-6" />
              </div>
              <h3 className="font-semibold text-[#1A1A1A] mb-2">
                Secure Access
              </h3>
              <p className="text-[#A1A8B3] text-sm">
                JWT-based authentication with bcrypt password hashing for
                enterprise security.
              </p>
            </CardContent>
          </Card>

          <Card className="border-[#DFE3E6]">
            <CardContent className="p-6">
              <div className="bg-[#FFE8D4] w-12 h-12 rounded-xl flex items-center justify-center mb-4">
                <Bot className="text-[#FE7C39] h-6 w-6" />
              </div>
              <h3 className="font-semibold text-[#1A1A1A] mb-2">
                AI-Powered Queries
              </h3>
              <p className="text-[#A1A8B3] text-sm">
                Natural language KPI queries powered by Google Gemini with
                schema awareness.
              </p>
            </CardContent>
          </Card>

          <Card className="border-[#DFE3E6]">
            <CardContent className="p-6">
              <div className="bg-[#FFE8D4] w-12 h-12 rounded-xl flex items-center justify-center mb-4">
                <BarChart3 className="text-[#FD5108] h-6 w-6" />
              </div>
              <h3 className="font-semibold text-[#1A1A1A] mb-2">
                Visual Analytics
              </h3>
              <p className="text-[#A1A8B3] text-sm">
                Interactive charts and tables with customizable views for
                comprehensive data analysis.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Database Configuration */}
        <div className="mb-6">
          <DatabaseConfig onDatabaseConnected={onDatabaseConnected} />
        </div>

        {/* Recent Activity */}
        {/* <Card className="border-[#DFE3E6]">
          <CardHeader>
            <CardTitle className="flex items-center text-[#1A1A1A]">
              <Activity className="mr-2 h-5 w-5 text-[#FD5108]" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#F5F7F8] rounded-lg">
                <div className="flex items-center">
                  <div className="bg-[#FFE8D4] w-8 h-8 rounded-full flex items-center justify-center mr-3">
                    <LogOut className="text-[#FD5108] h-4 w-4 rotate-180" />
                  </div>
                  <div>
                    <div className="font-medium text-[#1A1A1A]">User Login</div>
                    <div className="text-sm text-[#A1A8B3]">
                      {getSectorName(user.sector)} access granted
                    </div>
                  </div>
                </div>
                <div className="text-sm text-[#CBD1D6]">Just now</div>
              </div>

              <div className="text-center text-[#A1A8B3] text-sm py-8">
                No database connections yet. Connect to start tracking activity.
              </div>
            </div>
          </CardContent>
        </Card> */}
      </main>

      {/* Database Connection Modal */}
      <DatabaseModal
        isOpen={isDatabaseModalOpen}
        onClose={() => setIsDatabaseModalOpen(false)}
        onSuccess={(kpiSuggestions) => {
          setIsDatabaseModalOpen(false);
          onDatabaseConnected(kpiSuggestions);
        }}
      />
    </div>
  );
}
