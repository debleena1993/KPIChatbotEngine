import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
interface DatabaseConnectionLocal {
  id: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  type: string;
  isActive: boolean;
  schema?: any;
  lastConnected: string | null;
}
import { Database, Plug, Eye, EyeOff } from "lucide-react";

const reconnectSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

interface ReconnectFormData {
  password: string;
}

interface DatabaseReconnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReconnect: (password: string) => void;
  connection: DatabaseConnectionLocal | null;
  isLoading?: boolean;
}

export default function DatabaseReconnectModal({
  isOpen,
  onClose,
  onReconnect,
  connection,
  isLoading = false,
}: DatabaseReconnectModalProps) {
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ReconnectFormData>({
    resolver: zodResolver(reconnectSchema),
    defaultValues: {
      password: "",
    },
  });

  const handleSubmit = (data: ReconnectFormData) => {
    onReconnect(data.password);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  if (!connection) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Plug className="mr-2 h-5 w-5 text-[#FD5108]" />
            Reconnect Database
          </DialogTitle>
          <DialogDescription>
            Enter your password to reconnect to the database
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Database Connection Info */}
          <div className="bg-[#F5F7F8] p-4 rounded-lg space-y-2">
            <div className="flex items-center">
              <Database className="mr-2 h-4 w-4 text-[#A1A8B3]" />
              <span className="text-sm font-medium text-[#1A1A1A]">
                Connection Details
              </span>
            </div>
            <div className="text-sm text-[#A1A8B3] space-y-1">
              <div>
                <span className="font-medium">Host:</span> {connection.host}:{connection.port}
              </div>
              <div>
                <span className="font-medium">Database:</span> {connection.database}
              </div>
              <div>
                <span className="font-medium">Username:</span> {connection.username}
              </div>
            </div>
          </div>

          {/* Password Form */}
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  data-testid="input-reconnect-password"
                  {...form.register("password")}
                  placeholder="Enter your database password"
                  className="h-10 pr-10"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-10 w-10 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {form.formState.errors.password && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                data-testid="button-cancel-reconnect"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="button-confirm-reconnect"
                className="bg-[#FD5108] hover:bg-[#E8490A] text-white"
              >
                {isLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Plug className="mr-2 h-4 w-4" />
                    Reconnect
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}