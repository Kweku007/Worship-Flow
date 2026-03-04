const VOCAL_EXTRACTOR_BASE = 'https://vocal-extractor-pro.replit.app';

export interface ProcessingResult {
  songTitle: string;
  status: 'success' | 'error';
  mp3Buffer?: Buffer;
  filename?: string;
  error?: string;
}

export async function checkVocalExtractorHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${VOCAL_EXTRACTOR_BASE}/`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function processYoutubeUrl(
  youtubeUrl: string,
  songTitle: string,
  targetKey?: string
): Promise<ProcessingResult> {
  try {
    const body: Record<string, string> = { url: youtubeUrl };
    if (targetKey) {
      body.target_key = targetKey;
    }

    const res = await fetch(`${VOCAL_EXTRACTOR_BASE}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        songTitle,
        status: 'error',
        error: `Vocal Extractor returned ${res.status}: ${errorText}`,
      };
    }

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      const arrayBuffer = await res.arrayBuffer();
      const safeTitle = songTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      return {
        songTitle,
        status: 'success',
        mp3Buffer: Buffer.from(arrayBuffer),
        filename: `${safeTitle}.mp3`,
      };
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      const text = await res.text().catch(() => 'unknown');
      return {
        songTitle,
        status: 'error',
        error: `Vocal Extractor returned unexpected non-JSON response: ${text.slice(0, 200)}`,
      };
    }

    if (json.download_url) {
      const downloadRes = await fetch(
        json.download_url.startsWith('http')
          ? json.download_url
          : `${VOCAL_EXTRACTOR_BASE}${json.download_url}`
      );
      if (!downloadRes.ok) {
        return {
          songTitle,
          status: 'error',
          error: `Failed to download processed file: ${downloadRes.status}`,
        };
      }
      const arrayBuffer = await downloadRes.arrayBuffer();
      const safeTitle = songTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      return {
        songTitle,
        status: 'success',
        mp3Buffer: Buffer.from(arrayBuffer),
        filename: json.filename || `${safeTitle}.mp3`,
      };
    }

    if (json.task_id || json.job_id) {
      const taskId = json.task_id || json.job_id;
      return await pollForResult(taskId, songTitle);
    }

    return {
      songTitle,
      status: 'error',
      error: `Unexpected response format from Vocal Extractor: ${JSON.stringify(json)}`,
    };
  } catch (err: any) {
    return {
      songTitle,
      status: 'error',
      error: err.message || 'Unknown error processing song',
    };
  }
}

async function pollForResult(
  taskId: string,
  songTitle: string,
  maxAttempts = 60,
  intervalMs = 5000
): Promise<ProcessingResult> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    try {
      const res = await fetch(`${VOCAL_EXTRACTOR_BASE}/api/status/${taskId}`);
      if (!res.ok) continue;

      let json: any;
      try {
        json = await res.json();
      } catch {
        continue;
      }

      if (json.status === 'completed' || json.state === 'completed') {
        if (json.download_url) {
          const downloadRes = await fetch(
            json.download_url.startsWith('http')
              ? json.download_url
              : `${VOCAL_EXTRACTOR_BASE}${json.download_url}`
          );
          const arrayBuffer = await downloadRes.arrayBuffer();
          const safeTitle = songTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
          return {
            songTitle,
            status: 'success',
            mp3Buffer: Buffer.from(arrayBuffer),
            filename: json.filename || `${safeTitle}.mp3`,
          };
        }
      }

      if (json.status === 'failed' || json.state === 'failed') {
        return {
          songTitle,
          status: 'error',
          error: json.error || 'Processing failed on Vocal Extractor',
        };
      }
    } catch {
      continue;
    }
  }

  return {
    songTitle,
    status: 'error',
    error: 'Processing timed out after 5 minutes',
  };
}
