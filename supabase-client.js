// ============================================================
// DVpoint — Koneksi Supabase (supabase-client.js)
// ============================================================
// File ini HARUS dimuat di setiap halaman (lewat CDN Supabase dulu,
// baru file ini) SEBELUM storage.js/settings.js/i18n.js, supaya
// dvSupabase sudah siap dipakai fungsi-fungsi lain.
//
// anon key di bawah ini AMAN ditaruh di kode frontend/publik — ini
// memang didesain untuk itu (beda dari service_role key yang rahasia).
// Keamanan sesungguhnya diatur lewat Row Level Security (RLS) di
// database, bukan dengan menyembunyikan key ini.
// ============================================================

const DVPOINT_SUPABASE_URL = 'https://tyiyzocyubzqunlqfqxw.supabase.co';
const DVPOINT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5aXl6b2N5dWJ6cXVubHFmcXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0Nzk3MDIsImV4cCI6MjEwMzA1NTcwMn0.3TwB4dzDMsb7xtZIP3oJqGEZfhgZIxZ-Cicd2Jq5Arc';

// `supabase` (huruf kecil semua) adalah objek library global dari CDN.
// Instance koneksi kita namakan `dvSupabase` (beda nama) supaya tidak
// bentrok/menimpa objek library aslinya.
const dvSupabase = supabase.createClient(DVPOINT_SUPABASE_URL, DVPOINT_SUPABASE_ANON_KEY);