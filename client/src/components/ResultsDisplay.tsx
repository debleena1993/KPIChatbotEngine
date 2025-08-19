import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryResult } from "@/types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Table as TableIcon, BarChart3, Download, Database, ChevronDown, ChevronUp, Copy, Brain, Info } from "lucide-react";

interface ResultsDisplayProps {
  results: QueryResult;
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [showFullSQL, setShowFullSQL] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy');

  // Extract data from current API response format
  const table_data = results.data || [];
  const chart_data_array = results.chart_data || [];
  const chart_config = results.chart_config;
  const columns = results.columns || [];
  const row_count = table_data.length;
  const isLangGraphEnhanced = results.langgraph_enhanced || false;

  const formatValue = (value: any, columnName?: string): string => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">No data available</span> as any;
    }
    
    if (typeof value === 'number') {
      const colName = columnName?.toLowerCase() || '';
      
      // Format currency values (loan amounts, payments, etc.)
      if (colName.includes('amount') || colName.includes('loan') || colName.includes('payment') || colName.includes('avg')) {
        return value.toLocaleString('en-US', { 
          style: 'currency', 
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
      
      // Format percentages
      if (colName.includes('rate') || colName.includes('percent')) {
        return `${value.toFixed(2)}%`;
      }
      
      // Format regular numbers with commas for readability
      if (Math.abs(value) >= 1000) {
        return value.toLocaleString();
      }
      
      return value.toString();
    }
    
    return String(value);
  };

  const exportToCSV = () => {
    if (!table_data.length) return;

    const csvContent = [
      columns.join(','),
      ...table_data.map((row: any) => 
        columns.map((col: string) => {
          const value = row[col];
          // Escape quotes and wrap in quotes if contains comma
          const stringValue = String(value || '');
          return stringValue.includes(',') ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'kpi-results.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copySQL = async () => {
    try {
      await navigator.clipboard.writeText(results.sql_query);
      setCopyButtonText('Copied');
      setTimeout(() => setCopyButtonText('Copy'), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = results.sql_query;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopyButtonText('Copied');
      setTimeout(() => setCopyButtonText('Copy'), 2000);
    }
  };

  const renderChart = () => {
    if (!chart_data_array || chart_data_array.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No data available for chart visualization</p>
          </div>
        </div>
      );
    }

    const chartColors = ['#FD5108', '#FE7C39', '#FFAA72', '#A1A8B3', '#B5BCC4']; // PWC color palette

    switch (chart_config?.type || 'bar') {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chart_data_array}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={chartColors[0]} 
                strokeWidth={2}
                dot={{ fill: chartColors[0] }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chart_data_array}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chart_data_array.map((_: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );

      default: // bar chart
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chart_data_array}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors[0]} />
            </BarChart>
          </ResponsiveContainer>
        );
    }
  };

  if (!table_data.length && !chart_data_array?.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Database className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">No results returned for this query.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        {/* Results Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <Button
                size="sm"
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                data-testid="button-view-table"
                onClick={() => setViewMode('table')}
                className="h-8"
              >
                <TableIcon className="mr-1 h-3 w-3" />
                Table
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'chart' ? 'default' : 'ghost'}
                data-testid="button-view-chart"
                onClick={() => setViewMode('chart')}
                className="h-8"
              >
                <BarChart3 className="mr-1 h-3 w-3" />
                Chart
              </Button>
            </div>
            
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4" />
                <span>{row_count} rows returned</span>
              </div>
              
              {isLangGraphEnhanced && (
                <div className="flex items-center space-x-2 text-[#FD5108]">
                  <Brain className="h-4 w-4" />
                  <span>AI Enhanced</span>
                </div>
              )}
            </div>
          </div>
          
          <Button
            size="sm"
            variant="outline"
            data-testid="button-export-csv"
            onClick={exportToCSV}
            className="h-8"
          >
            <Download className="mr-1 h-3 w-3" />
            Export CSV
          </Button>
        </div>

        {/* LangGraph Insights */}
        {isLangGraphEnhanced && intelligentConfig && (
          <div className="mb-4 p-3 bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Brain className="h-4 w-4 text-[#FD5108]" />
                <span className="text-sm font-medium text-gray-800">AI Chart Intelligence</span>
                <Badge variant="secondary" className="text-xs bg-[#FD5108] text-white">
                  LangGraph Enhanced
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowInsights(!showInsights)}
                className="h-6 px-2 text-gray-600 hover:text-gray-800"
              >
                <Info className="h-3 w-3 mr-1" />
                {showInsights ? 'Hide' : 'Show'} Insights
                {showInsights ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
              </Button>
            </div>
            
            {showInsights && (
              <div className="mt-3 text-sm text-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium">Chart Type: <span className="text-[#FD5108]">{intelligentConfig.chart_type}</span></p>
                    {intelligentConfig.reason && (
                      <p className="text-gray-600 mt-1">{intelligentConfig.reason}</p>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">Data Analysis:</p>
                    {intelligentConfig.data_analysis && (
                      <div className="text-gray-600 mt-1 space-y-1">
                        <p>• {intelligentConfig.data_analysis.numeric_columns?.length || 0} numeric columns</p>
                        <p>• {intelligentConfig.data_analysis.categorical_columns?.length || 0} categorical columns</p>
                        <p>• {intelligentConfig.data_analysis.total_rows || 0} total rows</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {intelligentConfig.agent_insights && (
                  <div className="mt-3 p-2 bg-white rounded border border-orange-200">
                    <p className="font-medium text-gray-800">AI Insights:</p>
                    <p className="text-gray-600 mt-1 text-xs whitespace-pre-line">{intelligentConfig.agent_insights}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Results Content */}
        {viewMode === 'table' ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column: string) => (
                      <TableHead key={column} className="font-medium">
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table_data.slice(0, 100).map((row: any, index: number) => (
                    <TableRow key={index} data-testid={`table-row-${index}`}>
                      {columns.map((column: string) => (
                        <TableCell key={column} className="py-2">
                          {formatValue(row[column], column)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {table_data.length > 100 && (
              <div className="p-3 bg-gray-50 border-t text-sm text-gray-600 text-center">
                Showing first 100 rows of {table_data.length} total results
              </div>
            )}
          </div>
        ) : (
          <div data-testid="chart-container">
            {renderChart()}
          </div>
        )}

        {/* SQL Query Section */}
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                variant="ghost"
                data-testid="button-toggle-sql"
                onClick={() => setShowFullSQL(!showFullSQL)}
                className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900"
              >
                <Database className="mr-1 h-3 w-3" />
                SQL Query
                {showFullSQL ? (
                  <ChevronUp className="ml-1 h-3 w-3" />
                ) : (
                  <ChevronDown className="ml-1 h-3 w-3" />
                )}
              </Button>

            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <span>{row_count} rows returned</span>
            </div>
          </div>
          
          {showFullSQL && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-700">Generated SQL Query</span>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="button-copy-sql"
                  onClick={copySQL}
                  className="h-6 px-2 text-xs"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  {copyButtonText}
                </Button>
              </div>
              <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap bg-white p-3 rounded border overflow-x-auto">
                {results.sql_query}
              </pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
