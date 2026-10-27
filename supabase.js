import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const rawUrl = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://hsgacrvdfyrplpcwikap.supabase.co'
).trim();

const rawKey = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZ2FjcnZkZnlycGxwY3dpa2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MjA1ODIsImV4cCI6MjEwODI5NjU4Mn0.n_yxOfpmtj68EsGkLKlQA_yoqA0SRPIL5ffxVVz07-E'
).trim();

const formatUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('https://') || url.startsWith('http://')) return url;
  return `https://${url}.supabase.co`;
};

const SUPABASE_URL = formatUrl(rawUrl);
const SUPABASE_ANON_KEY = rawKey;

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes('your-project-id') &&
    SUPABASE_ANON_KEY.startsWith('ey')
);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
