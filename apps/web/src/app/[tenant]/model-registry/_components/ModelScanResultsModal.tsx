'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LocalTime } from '@/components/common/LocalTime';
import { Shield, AlertCircle, CheckCircle, Clock, Info } from 'lucide-react';

interface ScanResult {
  scan_id: string;
  status: string;
  findings_count: number;
  findings?: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    category: string;
    rule_id: string;
    location?: {
      file: string;
      line?: number;
      column?: number;
    };
  }>;
  metadata?: {
    model_name?: string;
    model_size?: number;
    scan_duration?: number;
    engine_version?: string;
  };
  created_at?: string;
  finished_at?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  scanResult: ScanResult | null;
  modelName: string;
  isLoading?: boolean;
}

export function ModelScanResultsModal({ isOpen, onClose, scanResult, modelName, isLoading = false }: Props) {
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'text-red-600 dark:text-red-400 bg-red-500/15 border-red-500/20';
      case 'high': return 'text-orange-600 dark:text-orange-400 bg-orange-500/15 border-orange-500/20';
      case 'medium': return 'text-amber-600 dark:text-amber-400 bg-amber-500/15 border-amber-500/20';
      case 'low': return 'text-blue-600 dark:text-blue-400 bg-blue-500/15 border-blue-500/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return <AlertCircle className="h-4 w-4" />;
      case 'medium':
        return <Info className="h-4 w-4" />;
      case 'low':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success': return 'text-green-600 dark:text-green-400 bg-green-500/15';
      case 'failed': return 'text-red-600 dark:text-red-400 bg-red-500/15';
      case 'running': return 'text-blue-600 dark:text-blue-400 bg-blue-500/15';
      case 'queued': return 'text-amber-600 dark:text-amber-400 bg-amber-500/15';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  if (!scanResult) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Security Scan Results - {modelName}
          </DialogTitle>
          <DialogDescription>
            Model Guard security analysis and vulnerability assessment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {isLoading ? (
            <div className="text-center py-8">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-medium mb-2">Loading Scan Results</h3>
              <p className="text-muted-foreground">
                Fetching security scan results for this model...
              </p>
            </div>
          ) : !scanResult ? (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Scan Results Found</h3>
              <p className="text-muted-foreground">
                This model has not been scanned yet. Use Model Guard to scan the model for security vulnerabilities.
              </p>
            </div>
          ) : (
            <>
              {/* Scan Summary */}
              <div className="rounded-lg border bg-muted/50 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{scanResult.findings_count}</div>
                <div className="text-sm text-muted-foreground">Total Findings</div>
              </div>
              <div className="text-center">
                <Badge className={getStatusColor(scanResult.status)}>
                  {scanResult.status.toUpperCase()}
                </Badge>
                <div className="text-sm text-muted-foreground mt-1">Scan Status</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {scanResult.findings?.filter(f => f.severity.toLowerCase() === 'critical').length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Critical</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {scanResult.findings?.filter(f => f.severity.toLowerCase() === 'high').length || 0}
                </div>
                <div className="text-sm text-muted-foreground">High</div>
              </div>
            </div>
          </div>

          {/* Metadata */}
          {scanResult.metadata && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="font-semibold mb-3">Scan Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {scanResult.metadata.model_name && (
                  <div>
                    <span className="font-medium text-muted-foreground">Model:</span>
                    <div>{scanResult.metadata.model_name}</div>
                  </div>
                )}
                {scanResult.metadata.model_size && (
                  <div>
                    <span className="font-medium text-muted-foreground">Size:</span>
                    <div>{(scanResult.metadata.model_size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                )}
                {scanResult.metadata.scan_duration && (
                  <div>
                    <span className="font-medium text-muted-foreground">Duration:</span>
                    <div>{scanResult.metadata.scan_duration}s</div>
                  </div>
                )}
                {scanResult.metadata.engine_version && (
                  <div>
                    <span className="font-medium text-muted-foreground">Engine:</span>
                    <div>v{scanResult.metadata.engine_version}</div>
                  </div>
                )}
                {scanResult.created_at && (
                  <div>
                    <span className="font-medium text-muted-foreground">Scanned:</span>
                    <div><LocalTime value={scanResult.created_at} mode="date" /></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Findings */}
          {scanResult.findings && scanResult.findings.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Security Findings</h3>
              <div className="space-y-3">
                {scanResult.findings.map((finding, index) => (
                  <div
                    key={finding.id || index}
                    className={`border rounded-lg p-4 ${getSeverityColor(finding.severity)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="flex-shrink-0 mt-0.5">
                          {getSeverityIcon(finding.severity)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold">{finding.title}</h4>
                            <Badge variant="outline" className="text-xs">
                              {finding.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {finding.category}
                            </Badge>
                          </div>
                          <p className="text-sm mb-2">{finding.description}</p>
                          {finding.location && (
                            <div className="text-xs opacity-80">
                              <span className="font-medium">Location:</span> {finding.location.file}
                              {finding.location.line && `:${finding.location.line}`}
                              {finding.location.column && `:${finding.location.column}`}
                            </div>
                          )}
                          {finding.rule_id && (
                            <div className="text-xs opacity-80 mt-1">
                              <span className="font-medium">Rule ID:</span> {finding.rule_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Security Issues Found</h3>
              <p className="text-muted-foreground">
                This model has been scanned and no security vulnerabilities or issues were detected.
              </p>
            </div>
          )}

              {/* Scan ID */}
              <div className="text-center text-sm text-muted-foreground">
                Scan ID: {scanResult.scan_id}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
