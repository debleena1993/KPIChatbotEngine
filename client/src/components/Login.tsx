import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useToast } from "@/hooks/use-toast";
import { authAPI, setAuthToken } from "@/lib/api";
import { LoginCredentials, User } from "@/types";
import {
  BarChart3,
  Building2,
  PieChart,
  Users,
  Eye,
  EyeOff,
  Bot,
  Shield,
} from "lucide-react";
import pwcLogo from "@assets/PwC_fl_c.png";
import productDesignImage from "@assets/Product-Design-184_1755521936737.png";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

interface LoginProps {
  onLogin: (token: string, user: User) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [selectedSector, setSelectedSector] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const sectors = [
    {
      id: "bank",
      name: "Banking",
      description: "Financial Institution Dashboard",
      icon: Building2,
      color: "bg-[#FD5108] hover:bg-[#E8490A]",
      hoverBg: "hover:bg-[#FFF5ED]",
      borderColor: "hover:border-[#FD5108]",
    },
    {
      id: "ithr",
      name: "HR Portal",
      description: "Human Resources Management",
      icon: Users,
      color: "bg-[#FE7C39] hover:bg-[#E8490A]",
      hoverBg: "hover:bg-[#FFE8D4]",
      borderColor: "hover:border-[#FE7C39]",
    },
  ];

  // Demo credentials mapping
  const demoCredentials: Record<
    string,
    { username: string; password: string }
  > = {
    bank: { username: "admin@bank", password: "bank123" },
    ithr: { username: "admin@ithr", password: "ithr123" },
  };

  const handleSectorSelect = (sectorId: string) => {
    setSelectedSector(sectorId);

    // Auto-fill demo credentials for selected sector
    const credentials = demoCredentials[sectorId];
    if (credentials) {
      form.setValue("username", credentials.username);
      form.setValue("password", credentials.password);
    }
  };

  const handleSubmit = async (data: LoginCredentials) => {
    if (!selectedSector) {
      toast({
        title: "Select a sector",
        description: "Please select your sector before logging in",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await authAPI.login(data);

      setAuthToken(response.access_token);
      onLogin(response.access_token, response.user);

      toast({
        title: "Login successful!",
        description: "Welcome to KPI Analytics Hub",
      });
    } catch (error) {
      toast({
        title: "Login failed",
        description:
          error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5ED] via-white to-[#FFE8D4] flex items-center justify-center py-4 px-4">
      <div className="flex max-w-4xl w-full h-auto shadow-xl rounded-xl overflow-hidden">
        {/* Left Side - Image Panel */}
        <div className="hidden md:flex md:w-1/2 bg-[#FD5108] border-2 border-r-0 border-[#DFE3E6] rounded-l-xl">
          <div className="w-full flex items-center justify-center p-6">
            <img
              src={productDesignImage}
              alt="KPI Analytics Illustration"
              className="w-full h-full object-contain max-h-[500px]"
            />
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full md:w-1/2 bg-white border-2 border-l-0 md:border-l-0 border-[#DFE3E6] rounded-xl md:rounded-l-none md:rounded-r-xl p-6">
          {/* Logo */}
          <div className="text-center mb-5">
            <img
              src={pwcLogo}
              alt="PWC Logo"
              className="h-14 w-auto object-contain mx-auto mb-3"
            />
            <h1 className="text-xl font-bold text-[#FD5108] mb-1">
              KPI Analytics Portal
            </h1>
            <p className="text-[#A1A8B3] text-sm">
              Select your sector and sign in
            </p>
          </div>

          {/* Sector Selection */}
          <div className="mb-4">
            <Label className="text-sm font-medium text-[#1A1A1A] mb-2 block">
              Choose Your Sector
            </Label>
            <div className="space-y-2">
              {sectors.map((sector) => (
                <button
                  key={sector.id}
                  data-testid={`sector-${sector.id}`}
                  onClick={() => handleSectorSelect(sector.id)}
                  className={`w-full p-3 rounded-lg border-2 transition-all duration-200 text-left group ${
                    selectedSector === sector.id
                      ? "border-[#FD5108] bg-[#FFF5ED] shadow-md"
                      : "border-[#DFE3E6] hover:border-[#FD5108] hover:bg-[#FFF5ED]"
                  }`}
                >
                  <div className="flex items-center">
                    <div
                      className={`text-white w-9 h-9 rounded-lg flex items-center justify-center mr-3 transition-transform ${sector.color}`}
                    >
                      <sector.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-[#1A1A1A] text-sm">
                        {sector.name}
                      </div>
                      <div className="text-xs text-[#A1A8B3]">
                        {sector.description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Login Form */}
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label
                htmlFor="username"
                className="text-[#1A1A1A] font-medium text-sm"
              >
                Username
              </Label>
              <Input
                id="username"
                data-testid="input-username"
                {...form.register("username")}
                placeholder="Enter your username"
                className="h-9 border-[#DFE3E6] focus:border-[#FD5108] focus:ring-[#FD5108] rounded-lg"
              />
              {form.formState.errors.username && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="password"
                className="text-[#1A1A1A] font-medium text-sm"
              >
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="input-password"
                  type={showPassword ? "text" : "password"}
                  {...form.register("password")}
                  placeholder="Enter your password"
                  className="h-9 pr-10 border-[#DFE3E6] focus:border-[#FD5108] focus:ring-[#FD5108] rounded-lg"
                />
                <button
                  type="button"
                  data-testid="button-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2 text-[#A1A8B3] hover:text-[#1A1A1A] transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              data-testid="button-login"
              disabled={isLoading}
              className="w-full h-9 bg-[#FD5108] hover:bg-[#E8490A] font-semibold text-white border-0 shadow-lg rounded-lg transition-all duration-200 hover:shadow-xl mt-3"
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-3 p-3 bg-[#F5F7F8] rounded-lg border border-[#DFE3E6]">
            <div className="text-xs font-medium text-[#1A1A1A] mb-2">
              Demo Credentials:
            </div>
            <div className="text-xs text-[#A1A8B3] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#1A1A1A]">Banking:</span>
                <span className="font-mono bg-white px-1.5 py-0.5 rounded text-xs">
                  admin@bank / bank123
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#1A1A1A]">HR:</span>
                <span className="font-mono bg-white px-1.5 py-0.5 rounded text-xs">
                  admin@ithr / ithr123
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
