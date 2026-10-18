import { supabase } from '@/utils/supabase';

const PROFILE_COLUMNS = 'id, full_name, phone, default_address';

export const getOwnProfile = (userId: string) => supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();

/** Only full_name, phone and default_address are writable (a column grant on profiles). */
export const updateOwnProfile = (userId: string, fields: Record<string, unknown>) =>
  supabase
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

/** Orders read the customer's name from user_metadata, so it is kept in step with the profile. */
export const updateUserMetadata = (data: Record<string, unknown>) => supabase.auth.updateUser({ data });
