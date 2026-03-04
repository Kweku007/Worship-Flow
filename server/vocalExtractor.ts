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
    if (targetKey && targetKey !== 'original') {
      body.targetKey = targetKey;
      body.target_key = targetKey;
    }

    console.log(`[vocal-extractor] Submitting: ${songTitle} (${youtubeUrl})`);

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

    const downloadLink = json.download_url || json.downloadUrl;
    if (downloadLink) {
      return await downloadFile(downloadLink, songTitle, json.filename);
    }

    const taskId = json.task_id || json.job_id || json.jobId || json.id;
    if (taskId) {
      console.log(`[vocal-extractor] Got job ID: ${taskId}, polling...`);
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

async function downloadFile(
  url: string,
  songTitle: string,
  filename?: string
): Promise<ProcessingResult> {
  const fullUrl = url.startsWith('http') ? url : `${VOCAL_EXTRACTOR_BASE}${url}`;
  const downloadRes = await fetch(fullUrl);
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
    filename: filename || `${safeTitle}.mp3`,
  };
}

async function pollForResult(
  taskId: string,
  songTitle: string,
  maxAttempts = 120,
  intervalMs = 5000
): Promise<ProcessingResult> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    try {
      const res = await fetch(`${VOCAL_EXTRACTOR_BASE}/api/jobs/${taskId}`);
      if (!res.ok) {
        console.log(`[vocal-extractor] Poll ${i + 1}: HTTP ${res.status}`);
        continue;
      }

      let json: any;
      try {
        json = await res.json();
      } catch {
        console.log(`[vocal-extractor] Poll ${i + 1}: non-JSON response`);
        continue;
      }

      const status = json.status || json.state;
      console.log(`[vocal-extractor] Poll ${i + 1}: status=${status}, progress=${json.progress || 'n/a'}`);

      if (status === 'completed' || status === 'done' || status === 'finished') {
        const downloadLink = json.download_url || json.downloadUrl || json.outputUrl || json.output_url;
        if (downloadLink) {
          return await downloadFile(downloadLink, songTitle, json.filename);
        }

        if (json.output || json.data) {
          const outputUrl = json.output?.url || json.data?.url || json.data?.downloadUrl;
          if (outputUrl) {
            return await downloadFile(outputUrl, songTitle, json.filename);
          }
        }

        return {
          songTitle,
          status: 'error',
          error: `Job completed but no download URL found: ${JSON.stringify(json).slice(0, 300)}`,
        };
      }

      if (status === 'failed' || status === 'error') {
        const errorMsg = json.errorMessage || json.error || json.message || 'Processing failed on Vocal Extractor';
        console.log(`[vocal-extractor] Job failed: ${errorMsg.slice(0, 200)}`);
        return {
          songTitle,
          status: 'error',
          error: errorMsg.length > 200 ? errorMsg.slice(0, 200) + '...' : errorMsg,
        };
      }
    } catch (err: any) {
      console.log(`[vocal-extractor] Poll ${i + 1}: error - ${err.message}`);
      continue;
    }
  }

  return {
    songTitle,
    status: 'error',
    error: 'Processing timed out after 10 minutes',
  };
}
