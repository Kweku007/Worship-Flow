import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Music, FileText, Send, Loader2, CheckCircle2, XCircle,
  SkipForward, Clock, RefreshCw, Mail, ExternalLink, Zap
} from 'lucide-react';

const MUSICAL_KEYS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
  'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm',
  'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bbm', 'Bm'
];

interface ParsedSong {
  title: string;
  youtubeUrl: string | null;
  isPlaylist: boolean;
  weekLabel: string;
}

interface SongWithKey extends ParsedSong {
  targetKey: string;
}

interface ProcessingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  songs: Array<{
    title: string;
    youtubeUrl: string | null;
    targetKey?: string;
    status: string;
    error?: string;
  }>;
  emailTo: string;
  weekLabel: string;
  startedAt: string;
  completedAt?: string;
  totalProcessed: number;
  totalSuccess: number;
  totalErrors: number;
}

export default function Dashboard() {
  const [docUrl, setDocUrl] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [songs, setSongs] = useState<SongWithKey[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [weekGroups, setWeekGroups] = useState<Record<string, SongWithKey[]>>({});
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const parseMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch('/api/parse-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docUrl: url }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      const songsWithKeys: SongWithKey[] = data.songs.map((s: ParsedSong) => ({
        ...s,
        targetKey: '',
      }));

      const groups: Record<string, SongWithKey[]> = {};
      for (const song of songsWithKeys) {
        if (!groups[song.weekLabel]) groups[song.weekLabel] = [];
        groups[song.weekLabel].push(song);
      }
      setWeekGroups(groups);

      const weeks = Object.keys(groups);
      if (weeks.length > 0) {
        setSelectedWeek(weeks[0]);
        setSongs(groups[weeks[0]]);
      }

      toast({
        title: 'Setlist loaded',
        description: `Found ${data.songs.length} songs across ${weeks.length} week(s)`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to parse document',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songs: songs.map((s) => ({
            title: s.title,
            youtubeUrl: s.youtubeUrl,
            targetKey: s.targetKey || undefined,
          })),
          emailTo,
          weekLabel: selectedWeek,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      toast({
        title: 'Processing started',
        description: 'Your songs are being processed. You\'ll get an email when done.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to start processing',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const { data: activeJob } = useQuery<ProcessingJob>({
    queryKey: ['job', activeJobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${activeJobId}`);
      return res.json();
    },
    enabled: !!activeJobId,
    refetchInterval: activeJobId ? 3000 : false,
  });

  useEffect(() => {
    if (activeJob?.status === 'completed' || activeJob?.status === 'error') {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }
  }, [activeJob?.status]);

  const { data: pastJobs } = useQuery<ProcessingJob[]>({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await fetch('/api/jobs');
      return res.json();
    },
  });

  function handleWeekChange(week: string) {
    setSelectedWeek(week);
    setSongs(weekGroups[week] || []);
  }

  function updateSongKey(index: number, key: string) {
    setSongs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], targetKey: key };
      return updated;
    });
  }

  function setAllKeys(key: string) {
    setSongs((prev) => prev.map((s) => ({ ...s, targetKey: key })));
  }

  const songsWithLinks = songs.filter((s) => s.youtubeUrl);
  const isProcessing = activeJob && (activeJob.status === 'pending' || activeJob.status === 'processing');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Music className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight" data-testid="text-app-title">Worship Flow</h1>
            <p className="text-xs text-muted-foreground">Setlist automation for your team</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Load Setlist from Google Doc
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                data-testid="input-doc-url"
                placeholder="Paste your Google Doc URL here..."
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                data-testid="button-parse-doc"
                onClick={() => parseMutation.mutate(docUrl)}
                disabled={!docUrl || parseMutation.isPending}
              >
                {parseMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Load
              </Button>
            </div>
          </CardContent>
        </Card>

        {Object.keys(weekGroups).length > 0 && (
          <>
            <Card className="border-border/50">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Music className="w-4 h-4 text-primary" />
                    Setlist
                  </CardTitle>
                  {Object.keys(weekGroups).length > 1 && (
                    <Select value={selectedWeek} onValueChange={handleWeekChange}>
                      <SelectTrigger className="w-[240px]" data-testid="select-week">
                        <SelectValue placeholder="Select week" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(weekGroups).map((week) => (
                          <SelectItem key={week} value={week}>
                            {week} ({weekGroups[week].length} songs)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {songs.length > 1 && (
                  <div className="flex items-center gap-2 pb-2">
                    <span className="text-sm text-muted-foreground">Set all keys to:</span>
                    <Select onValueChange={setAllKeys}>
                      <SelectTrigger className="w-[100px]" data-testid="select-all-keys">
                        <SelectValue placeholder="Key" />
                      </SelectTrigger>
                      <SelectContent>
                        {MUSICAL_KEYS.map((key) => (
                          <SelectItem key={key} value={key}>{key}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {songs.map((song, i) => (
                  <div
                    key={i}
                    data-testid={`card-song-${i}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30 hover:border-border/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" data-testid={`text-song-title-${i}`}>
                        {song.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {song.youtubeUrl ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={song.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary/70 hover:text-primary flex items-center gap-1"
                              data-testid={`link-youtube-${i}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              YouTube
                            </a>
                            {song.isPlaylist && (
                              <Badge variant="secondary" className="text-xs">
                                Playlist
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-no-link-${i}`}>
                            Title only
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Select
                      value={song.targetKey}
                      onValueChange={(val) => updateSongKey(i, val)}
                    >
                      <SelectTrigger className="w-[100px]" data-testid={`select-key-${i}`}>
                        <SelectValue placeholder="Key" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original">Original</SelectItem>
                        {MUSICAL_KEYS.map((key) => (
                          <SelectItem key={key} value={key}>{key}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                {songsWithLinks.length === 0 && songs.length > 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No songs with YouTube links found. Songs without links will be skipped during processing.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  Process &amp; Send
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-sm text-muted-foreground mb-1 block">Send results to:</label>
                    <Input
                      data-testid="input-email"
                      type="email"
                      placeholder="your@email.com"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  data-testid="button-process"
                  className="w-full"
                  size="lg"
                  onClick={() => processMutation.mutate()}
                  disabled={songsWithLinks.length === 0 || !emailTo || processMutation.isPending || !!isProcessing}
                >
                  {processMutation.isPending || isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Process {songsWithLinks.length} Song{songsWithLinks.length !== 1 ? 's' : ''} &amp; Email
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {activeJob && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {activeJob.status === 'processing' || activeJob.status === 'pending' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : activeJob.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                Current Job — {activeJob.weekLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeJob.songs.map((song, i) => (
                <div key={i} className="flex items-center gap-2 text-sm" data-testid={`status-song-${i}`}>
                  {song.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  {song.status === 'error' && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  {song.status === 'processing' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
                  {song.status === 'pending' && <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  {song.status === 'skipped' && <SkipForward className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className={song.status === 'skipped' ? 'text-muted-foreground' : ''}>
                    {song.title}
                    {song.targetKey && <span className="text-muted-foreground ml-1">({song.targetKey})</span>}
                  </span>
                  {song.error && (
                    <span className="text-xs text-destructive ml-auto">{song.error}</span>
                  )}
                </div>
              ))}

              {activeJob.status === 'completed' && (
                <div className="pt-2 border-t border-border/30 mt-3">
                  <p className="text-sm text-green-600 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    Email sent to {activeJob.emailTo}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {pastJobs && pastJobs.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Recent Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pastJobs.filter(j => j.id !== activeJobId).slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/20"
                    data-testid={`job-${job.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{job.weekLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(job.startedAt).toLocaleDateString()} — {job.songs.length} songs
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={job.status === 'completed' ? 'default' : job.status === 'error' ? 'destructive' : 'secondary'}
                      >
                        {job.status === 'completed' && `${job.totalSuccess} sent`}
                        {job.status === 'error' && 'Error'}
                        {job.status === 'processing' && 'In Progress'}
                        {job.status === 'pending' && 'Pending'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
