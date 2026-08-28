// Conexão com o Supabase
const SUPABASE_URL = 'https://xhinngtlwfpbvwvqftzb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoaW5uZ3Rsd2ZwYnZ3dnFmdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4ODI4NTYsImV4cCI6MjEwMzQ1ODg1Nn0.mmlcNqzlGFvIKP-_O1D6aNfbH6GY-V-d0OxYkZmpwHs';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
