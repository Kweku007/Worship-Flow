import type { WeekData, SectionValidation, SectionStatus, ValidationResult, EmailSent, SectionName } from '@shared/schema';
import { ADMIN_EMAIL, SECTION_NAMES } from '@shared/schema';
import { sendEmail } from './gmail';
import { log } from './index';

export function validateSections(weekData: WeekData): SectionValidation[] {
  const results: SectionValidation[] = [];

  for (const requiredSection of SECTION_NAMES) {
    const section = weekData.sections.find((s) => s.name === requiredSection);

    if (!section) {
      results.push({
        sectionName: requiredSection,
        leaderEmail: null,
        status: 'missing_leader',
        songCount: 0,
        songsWithLinks: 0,
        songsWithoutLinks: [],
      });
      continue;
    }

    const songsWithoutLinks = section.songs
      .filter((s) => !s.youtubeUrl)
      .map((s) => s.title);

    let status: SectionStatus;

    if (!section.leaderEmail) {
      status = 'missing_leader';
    } else if (section.songs.length === 0) {
      status = 'missing_songs';
    } else if (songsWithoutLinks.length > 0) {
      status = 'missing_links';
    } else {
      status = 'complete';
    }

    results.push({
      sectionName: section.name,
      leaderEmail: section.leaderEmail,
      status,
      songCount: section.songs.length,
      songsWithLinks: section.songs.filter((s) => s.youtubeUrl).length,
      songsWithoutLinks,
    });
  }

  return results;
}

export async function sendValidationEmails(
  validations: SectionValidation[],
  targetSunday: string
): Promise<EmailSent[]> {
  const emailsSent: EmailSent[] = [];
  const formattedDate = new Date(targetSunday + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  for (const v of validations) {
    if (v.status === 'complete') continue;

    if (v.status === 'missing_leader') {
      try {
        await sendEmail(
          ADMIN_EMAIL,
          `Action Needed: Missing Leader for ${v.sectionName} — ${formattedDate}`,
          buildAdminEmail(v.sectionName, formattedDate)
        );
        emailsSent.push({
          to: ADMIN_EMAIL,
          type: 'admin_missing_leader',
          sectionName: v.sectionName,
          sentAt: new Date().toISOString(),
        });
        log(`Admin email sent for missing leader in ${v.sectionName}`, 'validator');
      } catch (err: any) {
        log(`Failed to send admin email for ${v.sectionName}: ${err.message}`, 'validator');
      }
      continue;
    }

    if (v.leaderEmail && (v.status === 'missing_songs' || v.status === 'missing_links')) {
      try {
        await sendEmail(
          v.leaderEmail,
          `Reminder: Please Update Your ${v.sectionName} Setlist — ${formattedDate}`,
          buildLeaderEmail(v, formattedDate)
        );
        emailsSent.push({
          to: v.leaderEmail,
          type: 'leader_reminder',
          sectionName: v.sectionName,
          sentAt: new Date().toISOString(),
        });
        log(`Reminder sent to ${v.leaderEmail} for ${v.sectionName}`, 'validator');
      } catch (err: any) {
        log(`Failed to send reminder to ${v.leaderEmail}: ${err.message}`, 'validator');
      }
    }
  }

  return emailsSent;
}

function buildAdminEmail(sectionName: string, formattedDate: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Missing Leader Assignment</h2>
      <p>The <strong>${sectionName}</strong> section for <strong>${formattedDate}</strong> does not have a leader assigned in the setlist document.</p>
      <p>Please update the Google Doc with the leader's email address for this section.</p>
      <p style="color: #666; font-size: 13px; margin-top: 24px;">— Worship Flow Automation</p>
    </div>
  `;
}

function buildLeaderEmail(validation: SectionValidation, formattedDate: string): string {
  let issueDescription = '';

  if (validation.status === 'missing_songs') {
    issueDescription = `<p>Your <strong>${validation.sectionName}</strong> section for <strong>${formattedDate}</strong> doesn't have any songs listed yet.</p>
    <p>Please add your song selections along with their YouTube links to the setlist document.</p>`;
  } else if (validation.status === 'missing_links') {
    const missing = validation.songsWithoutLinks.map((s) => `<li>${s}</li>`).join('');
    issueDescription = `<p>Your <strong>${validation.sectionName}</strong> section for <strong>${formattedDate}</strong> has songs that are missing YouTube links:</p>
    <ul>${missing}</ul>
    <p>Please add the YouTube links for these songs in the setlist document.</p>`;
  }

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Setlist Reminder</h2>
      ${issueDescription}
      <p style="color: #666; font-size: 13px; margin-top: 24px;">— Worship Flow Automation</p>
    </div>
  `;
}
