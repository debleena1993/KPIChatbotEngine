import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Database, Eye, Trash2, ToggleRight, Table, Plug } from "lucide-react";
import { authenticatedRequest, databaseAPI } from "@/lib/api";
import DatabaseReconnectModal from "./DatabaseReconnectModal";

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

interface DatabaseConfigResponse {
  success: boolean;
  currentConnection: DatabaseConnectionLocal | null;
  connections: DatabaseConnectionLocal[];
}

interface DatabaseConfigProps {
  onDatabaseConnected?: (kpiSuggestions?: any[]) => void;
}

export default function DatabaseConfig({ onDatabaseConnected }: DatabaseConfigProps) {
  const [isSchemaDialogOpen, setIsSchemaDialogOpen] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<any>(null);
  const [isReconnectModalOpen, setIsReconnectModalOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<DatabaseConnectionLocal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get current user from localStorage to make query user-specific
  const getCurrentUser = () => {
    const storedUser = localStorage.getItem("authUser");
    return storedUser ? JSON.parse(storedUser) : null;
  };

  const currentUser = getCurrentUser();

  const { data: config, isLoading } = useQuery<DatabaseConfigResponse>({
    queryKey: ["/api/database-config", currentUser?.username],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token");

      const response = await fetch("/api/database-config", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch database config");
      }

      return response.json();
    },
  });

  const switchMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token");

      const response = await fetch("/api/switch-database", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connectionId }),
      });

      if (!response.ok) {
        throw new Error("Failed to switch database connection");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/database-config", currentUser?.username],
      });
      toast({
        title: "Database switched",
        description: "Active database connection updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Switch failed",
        description: error.message || "Could not switch database connection",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("No authentication token");

      const response = await fetch(`/api/database-connection/${connectionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to remove database connection");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/database-config", currentUser?.username],
      });
      toast({
        title: "Connection removed",
        description: "Database connection removed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Remove failed",
        description: error.message || "Could not remove database connection",
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async ({ connection, password }: { connection: DatabaseConnectionLocal; password: string }) => {
      const response = await databaseAPI.connect({
        host: connection.host,
        port: connection.port,
        database: connection.database,
        username: connection.username,
        password: password,
      });
      return response;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/database-config", currentUser?.username],
      });
      
      setIsReconnectModalOpen(false);
      setSelectedConnection(null);
      
      toast({
        title: "Database reconnected successfully!",
        description: "Redirecting to KPI chatbot with suggested queries...",
      });
      
      // Navigate to chatbot page with KPI suggestions
      if (onDatabaseConnected) {
        setTimeout(() => {
          onDatabaseConnected(response.suggested_kpis);
        }, 1000); // Small delay to show the success toast
      }
    },
    onError: (error: any) => {
      toast({
        title: "Reconnection failed",
        description: error.message || "Could not reconnect to database",
        variant: "destructive",
      });
    },
  });

  const handleViewSchema = (connection: DatabaseConnectionLocal) => {
    setSelectedSchema(connection.schema);
    setIsSchemaDialogOpen(true);
  };

  const handleSwitchConnection = (connectionId: string) => {
    switchMutation.mutate(connectionId);
  };

  const handleRemoveConnection = (connectionId: string) => {
    if (confirm("Are you sure you want to remove this database connection?")) {
      removeMutation.mutate(connectionId);
    }
  };

  const handleConnectDatabase = (connection: DatabaseConnectionLocal) => {
    setSelectedConnection(connection);
    setIsReconnectModalOpen(true);
  };

  const handleReconnect = (password: string) => {
    if (selectedConnection) {
      connectMutation.mutate({ connection: selectedConnection, password });
    }
  };

  const handleCloseReconnectModal = () => {
    setIsReconnectModalOpen(false);
    setSelectedConnection(null);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Database className="mr-2 h-5 w-5" />
            Database Activity Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            Loading configurations...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!config?.success || !config.connections?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Database className="mr-2 h-5 w-5" />
            Database Activity Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">
            No database connections yet. Connect to start tracking activity.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Database className="mr-2 h-5 w-5" />
            Database Activity Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.connections.map((connection) => (
            <div
              key={connection.id}
              className={`p-4 border rounded-lg ${
                connection.isActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium">{connection.database}</h3>
                    {connection.isActive && (
                      <Badge variant="default" className="text-xs">
                        Active
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {connection.type}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div>
                      Host: {connection.host}:{connection.port}
                    </div>
                    <div>User: {connection.username}</div>
                    <div>
                      Last Connected: {formatDate(connection.lastConnected)}
                    </div>
                    {connection.schema?.tables && (
                      <div>
                        Tables: {Object.keys(connection.schema.tables).length}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Schema View Button - Always available if schema exists */}
                  {connection.schema && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewSchema(connection)}
                      data-testid={`button-view-schema-${connection.id}`}
                      title="View database schema"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Connect Button - Only show for active connections */}
                  {connection.isActive && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleConnectDatabase(connection)}
                      disabled={connectMutation.isPending}
                      data-testid={`button-connect-${connection.id}`}
                      title="Reconnect to this database"
                    >
                      {connectMutation.isPending ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <Plug className="h-4 w-4" />
                      )}
                    </Button>
                  )}

                  {/* Switch Connection Button - Only show for inactive connections */}
                  {!connection.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSwitchConnection(connection.id)}
                      disabled={switchMutation.isPending}
                      data-testid={`button-switch-${connection.id}`}
                      title="Switch to this database"
                    >
                      <ToggleRight className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Remove Button - Available for non-default connections */}
                  {connection.id !== "default" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveConnection(connection.id)}
                      disabled={removeMutation.isPending}
                      data-testid={`button-remove-${connection.id}`}
                      title="Remove this connection"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={isSchemaDialogOpen} onOpenChange={setIsSchemaDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Table className="mr-2 h-5 w-5" />
              Database Schema
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="h-[60vh]">
            {selectedSchema && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  Schema extracted on:{" "}
                  {selectedSchema.extractedAt
                    ? new Date(selectedSchema.extractedAt).toLocaleString()
                    : "Unknown"}
                </div>

                {Object.entries(selectedSchema.tables || {}).map(
                  ([tableName, table]: [string, any]) => (
                    <Card key={tableName}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">{tableName}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {Object.entries(table.columns || {}).map(
                            ([columnName, column]: [string, any]) => (
                              <div
                                key={columnName}
                                className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded"
                              >
                                <span className="font-mono text-sm">
                                  {columnName}
                                </span>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {column.type}
                                  </Badge>
                                  {!column.nullable && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      NOT NULL
                                    </Badge>
                                  )}
                                  {column.default && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      DEFAULT: {column.default}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ),
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Database Reconnect Modal */}
      <DatabaseReconnectModal
        isOpen={isReconnectModalOpen}
        onClose={handleCloseReconnectModal}
        onReconnect={handleReconnect}
        connection={selectedConnection}
        isLoading={connectMutation.isPending}
      />
    </>
  );
}
