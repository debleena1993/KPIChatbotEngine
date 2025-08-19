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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { databaseAPI } from "@/lib/api";
import { DatabaseConnection, KPISuggestion } from "@/types";
import { Database, Zap } from "lucide-react";

const databaseSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.number().min(1, "Port must be a valid number").max(65535),
  database: z.string().min(1, "Database name is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (kpiSuggestions?: KPISuggestion[]) => void;
}

export default function DatabaseModal({
  isOpen,
  onClose,
  onSuccess,
}: DatabaseModalProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  const form = useForm<DatabaseConnection>({
    resolver: zodResolver(databaseSchema),
    defaultValues: {
      host: "localhost",
      port: 5432,
      database: "",
      username: "",
      password: "",
    },
  });

  const handleTestConnection = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;

    setIsTesting(true);

    try {
      const formData = form.getValues();
      // For testing, we'll just validate the form and show success
      // In production, you might want a separate test endpoint
      toast({
        title: "Connection test successful!",
        description: "Database connection parameters are valid",
      });
    } catch (error) {
      toast({
        title: "Connection test failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not connect to database",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async (data: DatabaseConnection) => {
    setIsConnecting(true);

    try {
      const response = await databaseAPI.connect(data);

      if (response.status === "connected") {
        const tableCount =
          response.schema?.totalTables ||
          Object.keys(response.schema?.tables || {}).length;

        toast({
          title: "Database connected successfully!",
          description: ``,
        });
        // description: `Schema extracted with ${tableCount} tables. AI-generated KPI suggestions ready.`
        form.reset();
        onSuccess(response.suggested_kpis);
        onClose();
      } else {
        throw new Error(response.message || "Connection failed");
      }
    } catch (error) {
      toast({
        title: "Connection failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not connect to database",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Database className="mr-2 h-5 w-5" />
            Database Connection
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleConnect)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                data-testid="input-db-host"
                {...form.register("host")}
                placeholder="localhost"
                className="h-10"
              />
              {form.formState.errors.host && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.host.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                data-testid="input-db-port"
                type="number"
                {...form.register("port", { valueAsNumber: true })}
                placeholder="5432"
                className="h-10"
              />
              {form.formState.errors.port && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.port.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="database">Database Name</Label>
            <Input
              id="database"
              data-testid="input-db-name"
              {...form.register("database")}
              placeholder="your_database_name"
              className="h-10"
            />
            {form.formState.errors.database && (
              <p className="text-sm text-red-600">
                {form.formState.errors.database.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              data-testid="input-db-username"
              {...form.register("username")}
              placeholder="database_user"
              className="h-10"
            />
            {form.formState.errors.username && (
              <p className="text-sm text-red-600">
                {form.formState.errors.username.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              data-testid="input-db-password"
              type="password"
              {...form.register("password")}
              placeholder="••••••••"
              className="h-10"
            />
            {form.formState.errors.password && (
              <p className="text-sm text-red-600">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="flex space-x-3">
            {/* <Button 
              type="button"
              data-testid="button-test-connection"
              variant="outline"
              className="flex-1"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              <Zap className="mr-2 h-4 w-4" />
              {isTesting ? "Testing..." : "Test Connection"}
            </Button> */}

            <Button
              type="submit"
              data-testid="button-connect"
              className="flex-1 text-white hover:text-gray-200"
              disabled={isConnecting}
            >
              <Database className="mr-2 h-4 w-4" />
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
