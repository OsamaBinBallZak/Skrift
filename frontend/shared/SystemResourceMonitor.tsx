import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  Monitor, 
  Cpu, 
  MemoryStick, 
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';

// Import our backend API
import { apiService, SystemResources, SystemStatus, checkBackendConnection } from '../src/api';

interface SystemResourceMonitorProps {
  currentProcessingFile?: string;
  processingStep?: string;
  compact?: boolean;
}

export function SystemResourceMonitor({ 
  compact = false 
}: SystemResourceMonitorProps) {
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);

  // Check backend connection and fetch data
  useEffect(() => {
    const interval: NodeJS.Timeout = setInterval(() => {/* placeholder */}, 1000);

    const fetchData = async () => {
      try {
        const connected = await checkBackendConnection();
        setBackendConnected(connected);

        if (connected) {
          const [resourcesData, statusData] = await Promise.all([
            apiService.getSystemResources(),
            apiService.getSystemStatus()
          ]);
          setResources(resourcesData);
          setStatus(statusData);
        } else {
          // Use mock data when backend is not available
          setResources({
            cpuUsage: 25.0,
            ramUsed: 8.2,
            ramTotal: 24.0,
            coreTemp: 52
          });
          setStatus({
            processing: false,
            queueLength: 0
          });
        }
      } catch (err) {
        console.error('Failed to fetch system data:', err);
        setBackendConnected(false);
        // Set fallback data on error
        setResources({
          cpuUsage: 25.0,
          ramUsed: 8.2,
          ramTotal: 24.0
        });
        setStatus({
          processing: false,
          queueLength: 0
        });
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchData();

    // Set up polling interval (every 3 seconds)
    clearInterval(interval);
    const pollingInterval = setInterval(fetchData, 3000);

    return () => {
      clearInterval(pollingInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Card className="w-80 bg-background-tertiary">
        <CardContent className="p-3">
          <div className="flex items-center space-x-2 text-text-secondary">
            <Activity className="w-4 h-4 animate-pulse" />
            <span className="text-sm">Loading system info...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!resources) {
    return (
      <Card className="w-80 border-status-warning-border bg-status-warning-bg">
        <CardContent className="p-3">
          <div className="flex items-center space-x-2 text-status-warning-text">
            <WifiOff className="w-4 h-4" />
            <span className="text-sm">System monitor unavailable</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cpuPercentage = Math.round(resources.cpuUsage);
  const memoryUsedGB = resources.ramUsed;
  const memoryTotalGB = resources.ramTotal;
  const memoryPercentage = Math.round((memoryUsedGB / memoryTotalGB) * 100);

  const getCpuStatus = (percentage: number) => {
    if (percentage > 80) return { color: 'bg-status-error-bg text-status-error-text', label: 'High' };
    if (percentage > 60) return { color: 'bg-status-warning-bg text-status-warning-text', label: 'Medium' };
    return { color: 'bg-status-success-bg text-status-success-text', label: 'Low' };
  };

  const getMemoryStatus = (percentage: number) => {
    if (percentage > 85) return { color: 'bg-status-error-bg text-status-error-text', label: 'High' };
    if (percentage > 70) return { color: 'bg-status-warning-bg text-status-warning-text', label: 'Medium' };
    return { color: 'bg-status-success-bg text-status-success-text', label: 'Low' };
  };

  const cpuStatus = getCpuStatus(cpuPercentage);
  const memoryStatus = getMemoryStatus(memoryPercentage);

  if (compact) {
    return (
      <div className="flex items-center space-x-4 px-4 py-2 bg-surface-elevated rounded-lg border border-theme-border">
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-theme-primary" />
          <span className="text-sm font-medium text-text-primary">{cpuPercentage}%</span>
          <Badge variant="outline" className={`text-xs ${cpuStatus.color}`}>
            {cpuStatus.label}
          </Badge>
        </div>

        <div className="w-px h-6 bg-theme-border" />

        <div className="flex items-center space-x-2">
          <MemoryStick className="w-4 h-4 text-theme-primary" />
          <span className="text-sm font-medium text-text-primary">{memoryUsedGB.toFixed(1)}GB</span>
          <Badge variant="outline" className={`text-xs ${memoryStatus.color}`}>
            {memoryStatus.label}
          </Badge>
        </div>

        {status?.processing && (
          <>
            <div className="w-px h-6 bg-theme-border" />
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-theme-primary animate-pulse" />
              <span className="text-sm text-secondary">Processing</span>
            </div>
          </>
        )}

        <div className="flex items-center space-x-1">
          {backendConnected ? (
            <Wifi className="w-3 h-3 text-status-success-text" />
          ) : (
            <WifiOff className="w-3 h-3 text-status-error-text" />
          )}
          <Badge variant="outline" className="text-xs">
            {backendConnected ? 'Live' : 'Mock'}
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <Card className="w-80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-base">
          <Monitor className="w-5 h-5 text-theme-primary" />
          <span>System Monitor</span>
          <div className="flex items-center space-x-1">
            {backendConnected ? (
              <Wifi className="w-3 h-3 text-status-success-text" />
            ) : (
              <WifiOff className="w-3 h-3 text-status-error-text" />
            )}
            <Badge variant="outline" className="text-xs">
              {backendConnected ? 'Backend Connected' : 'Mock Data'}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* CPU Usage */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">CPU Usage</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">{cpuPercentage}%</span>
              <Badge className={`text-xs ${cpuStatus.color}`}>
                {cpuStatus.label}
              </Badge>
            </div>
          </div>
          <Progress value={cpuPercentage} className="h-2" />
        </section>

        {/* Memory Usage */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MemoryStick className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">Memory</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">{memoryUsedGB.toFixed(1)}GB</span>
              <Badge className={`text-xs ${memoryStatus.color}`}>
                {memoryStatus.label}
              </Badge>
            </div>
          </div>
          <Progress value={memoryPercentage} className="h-2" />
          <div className="flex justify-between text-xs text-text-tertiary">
            <span>{memoryUsedGB.toFixed(1)}GB used</span>
            <span>{memoryTotalGB.toFixed(1)}GB total</span>
          </div>
        </section>

        {/* Temperature */}
        {resources.coreTemp && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Monitor className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">Temperature</span>
              </div>
              <span className="text-sm font-medium">{resources.coreTemp}°C</span>
            </div>
          </section>
        )}

        {/* Status Footer */}
        <div className="pt-2 border-t text-xs text-text-tertiary flex items-center justify-between">
          <span>Updated 3s ago</span>
          <span>Queue: {status?.queueLength || 0}</span>
        </div>
      </CardContent>
    </Card>
  );
}
