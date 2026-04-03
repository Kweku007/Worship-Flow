import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Music, CheckCircle2, XCircle, AlertTriangle, Clock,
  RefreshCw, Mail, Calendar, Play, User, Link2, Loader2, Lock
} from 'lucide-react';

interface SectionValidation {
  sectionName: string;
  leaderEmail: string | null;
  status: 'complete' | 'missing_songs' | 'missing_links' | 'missing_leader';
  songCount: number;
  songsWithLinks: number;
  songsWithoutLinks: string[];
}

interface EmailSent {
  to: string;
  type: 'leader_reminder' | 'admin_missing_leader';
  sectionName: string;
  sentAt: string;
}

interface ServiceResult {
  serviceDate: string;
  rawHeader: string;
  sections: SectionValidation[];
  emailsSent: EmailSent[];
}

interface ValidationResult {
  id: string;
  targetSunday: string;
  ranAt: string;
  trigger: 'scheduled' | 'manual';
  services: ServiceResult[];
  emailsSent: EmailSent[];
  error?: string;
}

interface ScheduleInfo {
  nextRunAt: string;
  targetSunday: string;
}

interface ServicePreview {
  serviceDate: string;
  rawHeader: string;
  sections: Array<{
    name: string;
    leaderEmail: string | null;
    songs: Array<{ title: string; youtubeUrl: string | null }>;
  }>;
}

interface PreviewData {
  targetSunday: string;
  services: ServicePreview[];
}

function statusIcon(status: string) {
  switch (status) {
    case 'complete': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'missing_leader': return <XCircle className="w-4 h-4 text-red-500" />;
    case 'missing_songs': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'missing_links': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    default: return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'complete': return 'Complete';
    case 'missing_leader': return 'No Leader';
    case 'missing_songs': return 'No Songs';
    case 'missing_links': return 'Missing Links';
    default: return status;
  }
}

function statusBadgeVariant(status: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'complete': return 'default';
    case 'missing_leader': return 'destructive';
    case 'missing_songs': return 'secondary';
    case 'missing_links': return 'secondary';
    default: return 'outline';
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatServiceDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' CT';
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState('');

  const { data: schedule } = useQuery<ScheduleInfo>({
    queryKey: ['schedule'],
    queryFn: () => fetch('/api/schedule').then((r) => r.json()),
  });

  const { data: history, isLoading: historyLoading } = useQuery<ValidationResult[]>({
    queryKey: ['history'],
    queryFn: () => fetch('/api/history').then((r) => r.json()),
    refetchInterval: 30000,
  });

  const { data: preview, isLoading: previewLoading, isFetching: previewFetching } = useQuery<PreviewData>({
    queryKey: ['preview'],
    queryFn: () => fetch('/api/preview').then((r) => r.json()),
    refetchInterval: 60000,
  });

  const runNowMutation = useMutation({
    mutationFn: async (enteredPin: string) => {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: enteredPin }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (result: ValidationResult) => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['preview'] });
      setShowPinInput(false);
      setPin('');
      const totalComplete = result.services.reduce((sum, s) => sum + s.sections.filter((sec) => sec.status === 'complete').length, 0);
      const totalSections = result.services.reduce((sum, s) => sum + s.sections.length, 0);
      const serviceCount = result.services.length;
      toast({
        title: 'Validation complete',
        description: `${totalComplete}/${totalSections} sections ready across ${serviceCount} service(s). ${result.emailsSent.length} email(s) sent.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Validation failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const latestRun = history?.[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Music className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight" data-testid="text-app-title">Worship Flow</h1>
              <p className="text-xs text-muted-foreground">Setlist validation & reminders</p>
            </div>
          </div>
          {showPinInput ? (
            <div className="flex items-center gap-2">
              <Input
                data-testid="input-pin"
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pin) runNowMutation.mutate(pin);
                }}
                className="w-28 h-8 text-sm"
                autoFocus
              />
              <Button
                data-testid="button-submit-pin"
                onClick={() => runNowMutation.mutate(pin)}
                disabled={runNowMutation.isPending || !pin}
                size="sm"
              >
                {runNowMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              <Button
                data-testid="button-cancel-pin"
                variant="ghost"
                size="sm"
                onClick={() => { setShowPinInput(false); setPin(''); }}
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              data-testid="button-run-now"
              onClick={() => setShowPinInput(true)}
              size="sm"
            >
              <Lock className="w-4 h-4 mr-2" />
              Run Now
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {schedule && (
          <Card className="border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium" data-testid="text-next-run">
                      Next check: {formatDateTime(schedule.nextRunAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Validating setlists for the week of Sunday {formatDate(schedule.targetSunday)}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  Mon-Sat 9 AM & 5 PM
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {preview && preview.services && preview.services.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-primary" />
                  Current Setlist Preview — Week of Sunday {formatDate(preview.targetSunday)}
                </CardTitle>
                <Button
                  data-testid="button-refresh-preview"
                  variant="ghost"
                  size="sm"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['preview'] })}
                  disabled={previewFetching}
                >
                  <RefreshCw className={`w-4 h-4 ${previewFetching ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {preview.services.map((service) => (
                <div
                  key={service.serviceDate}
                  data-testid={`preview-service-${service.serviceDate}`}
                >
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatServiceDate(service.serviceDate)}
                  </h3>
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                    {service.sections.map((section) => (
                      <div
                        key={section.name}
                        className="p-4 rounded-lg border border-border/50 bg-muted/20 overflow-hidden"
                        data-testid={`preview-section-${service.serviceDate}-${section.name.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <h4 className="font-medium text-sm mb-2">{section.name}</h4>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 min-w-0">
                          <User className="w-3 h-3 shrink-0" />
                          <span
                            className="break-all"
                            data-testid={`text-leader-${service.serviceDate}-${section.name.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            {section.leaderEmail || 'No leader assigned'}
                          </span>
                        </div>
                        {section.songs.length > 0 ? (
                          <ul className="space-y-1.5">
                            {section.songs.map((song, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs">
                                {song.youtubeUrl ? (
                                  <Link2 className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                                ) : (
                                  <XCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                                )}
                                <span className="break-words">{song.title}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No songs yet</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {preview && (!preview.services || preview.services.length === 0) && !previewLoading && (
          <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">No setlists found</p>
                  <p className="text-xs text-muted-foreground">
                    Could not find any services for the week of Sunday {preview?.targetSunday ? formatDate(preview.targetSunday) : ''} in the document.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {previewLoading && (
          <Card className="border-border/50">
            <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading setlist preview...</span>
            </CardContent>
          </Card>
        )}

        {latestRun && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  Latest Validation — Week of Sunday {formatDate(latestRun.targetSunday)}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {latestRun.trigger === 'scheduled' ? 'Scheduled' : 'Manual'} — {formatDateTime(latestRun.ranAt)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {latestRun.error ? (
                <div className="flex items-center gap-2 text-sm text-red-500" data-testid="text-validation-error">
                  <XCircle className="w-4 h-4" />
                  {latestRun.error}
                </div>
              ) : (
                <div className="space-y-6">
                  {latestRun.services.map((service) => (
                    <div key={service.serviceDate} data-testid={`validation-service-${service.serviceDate}`}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatServiceDate(service.serviceDate)}
                      </h3>
                      <div className="grid gap-3 md:grid-cols-3">
                        {service.sections.map((section) => (
                          <div
                            key={section.sectionName}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30"
                            data-testid={`validation-section-${service.serviceDate}-${section.sectionName.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            <div className="flex items-center gap-2">
                              {statusIcon(section.status)}
                              <div>
                                <p className="text-sm font-medium">{section.sectionName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {section.leaderEmail || 'No leader'}
                                </p>
                              </div>
                            </div>
                            <Badge variant={statusBadgeVariant(section.status)} className="text-xs">
                              {statusLabel(section.status)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {latestRun.emailsSent.length > 0 && (
                    <div className="border-t border-border/30 pt-3">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        Emails sent:
                      </p>
                      <div className="space-y-1">
                        {latestRun.emailsSent.map((email, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs" data-testid={`email-sent-${i}`}>
                            <Badge variant="outline" className="text-xs">
                              {email.type === 'leader_reminder' ? 'Reminder' : 'Admin Alert'}
                            </Badge>
                            <span>{email.to}</span>
                            <span className="text-muted-foreground">({email.sectionName})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Run History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : history && history.length > 0 ? (
              <div className="space-y-2">
                {history.slice(0, 10).map((run) => {
                  const totalComplete = run.services.reduce((sum, s) => sum + s.sections.filter((sec) => sec.status === 'complete').length, 0);
                  const totalSections = run.services.reduce((sum, s) => sum + s.sections.length, 0);
                  const serviceCount = run.services.length;
                  const allGood = totalComplete === totalSections && totalSections > 0;

                  return (
                    <div
                      key={run.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                      data-testid={`history-run-${run.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {run.error ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : allGood ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            Week of Sunday {formatDate(run.targetSunday)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(run.ranAt)} — {run.trigger}
                            {serviceCount > 0 && ` — ${serviceCount} service${serviceCount > 1 ? 's' : ''}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {run.error ? (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        ) : (
                          <>
                            <Badge variant={allGood ? 'default' : 'secondary'} className="text-xs">
                              {totalComplete}/{totalSections} ready
                              {serviceCount > 1 && ` across ${serviceCount} services`}
                            </Badge>
                            {run.emailsSent.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <Mail className="w-3 h-3 mr-1" />
                                {run.emailsSent.length}
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-history">
                No validation runs yet. Click "Run Now" to perform the first check.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
