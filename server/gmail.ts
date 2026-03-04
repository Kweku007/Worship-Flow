// Gmail Integration (Replit Connector)
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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

interface Attachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export async function sendEmailWithAttachments(
  to: string,
  subject: string,
  bodyHtml: string,
  attachments: Attachment[]
): Promise<void> {
  const gmail = await getUncachableGmailClient();

  const boundary = 'boundary_' + Date.now().toString(36);
  const nl = '\r\n';

  let message = '';
  message += `To: ${to}${nl}`;
  message += `Subject: ${subject}${nl}`;
  message += `MIME-Version: 1.0${nl}`;
  message += `Content-Type: multipart/mixed; boundary="${boundary}"${nl}${nl}`;

  message += `--${boundary}${nl}`;
  message += `Content-Type: text/html; charset="UTF-8"${nl}${nl}`;
  message += bodyHtml + nl;

  for (const att of attachments) {
    message += `--${boundary}${nl}`;
    message += `Content-Type: ${att.mimeType}; name="${att.filename}"${nl}`;
    message += `Content-Disposition: attachment; filename="${att.filename}"${nl}`;
    message += `Content-Transfer-Encoding: base64${nl}${nl}`;
    message += att.content.toString('base64') + nl;
  }

  message += `--${boundary}--`;

  const raw = Buffer.from(message).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}
