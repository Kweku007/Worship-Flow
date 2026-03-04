// Google Docs Integration (Replit Connector)
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-docs',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Docs not connected');
  }
  return accessToken;
}

export async function getUncachableGoogleDocsClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.docs({ version: 'v1', auth: oauth2Client });
}

export interface ParsedSong {
  title: string;
  youtubeUrl: string | null;
  weekLabel: string;
}

export function extractDocumentId(urlOrId: string): string {
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]+$/.test(urlOrId)) return urlOrId;
  throw new Error('Could not extract Google Doc ID from the provided URL');
}

export async function parseSetlistFromDoc(documentId: string): Promise<ParsedSong[]> {
  const docs = await getUncachableGoogleDocsClient();
  const doc = await docs.documents.get({ documentId });

  const content = doc.data.body?.content || [];
  const songs: ParsedSong[] = [];
  let currentWeek = 'Unknown Week';

  for (const element of content) {
    if (element.paragraph) {
      const para = element.paragraph;
      const style = para.paragraphStyle?.namedStyleType || '';

      let fullText = '';
      let linkUrl: string | null = null;

      for (const el of para.elements || []) {
        const text = el.textRun?.content || '';
        fullText += text;

        const link = el.textRun?.textStyle?.link?.url;
        if (link && isYoutubeUrl(link)) {
          linkUrl = link;
        }
      }

      fullText = fullText.trim();
      if (!fullText) continue;

      if (style.includes('HEADING') || looksLikeWeekHeader(fullText)) {
        currentWeek = fullText;
        continue;
      }

      const inlineYoutubeUrl = extractYoutubeUrl(fullText);
      const finalUrl = linkUrl || inlineYoutubeUrl;

      const title = cleanSongTitle(fullText);
      if (title) {
        songs.push({
          title,
          youtubeUrl: finalUrl,
          weekLabel: currentWeek,
        });
      }
    }
  }

  return songs;
}

function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

function extractYoutubeUrl(text: string): string | null {
  const match = text.match(/(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+/i);
  return match ? match[0] : null;
}

function looksLikeWeekHeader(text: string): boolean {
  return /week|sunday|service|date|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/-]\d{1,2}/i.test(text);
}

function cleanSongTitle(text: string): string {
  let cleaned = text.replace(/(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[^\s]*/gi, '');
  cleaned = cleaned.replace(/[-–—•*·]\s*/, '');
  cleaned = cleaned.trim();
  if (cleaned.length < 2) return '';
  if (looksLikeWeekHeader(cleaned) && !/[a-z]/i.test(cleaned.replace(/\d+/g, '').replace(/[\s\-\/]/g, ''))) return '';
  return cleaned;
}
