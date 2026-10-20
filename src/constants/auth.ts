/**
 * Seconds before Resend code works again; the server refuses a sooner code for the same email too.
 * Matches Supabase's own minimum interval between emails to one address (60 s, not in the dashboard).
 */
export const RESEND_SECONDS = 60;
