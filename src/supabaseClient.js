import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://mshxynebahxiaodoqpeb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zaHh5bmViYWh4aWFvZG9xcGViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MTQ5NjUsImV4cCI6MjA5ODA5MDk2NX0.z1jibmJEivNMmQCey3HjOe-hV0Pgg91g-EYkeJKvP34";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);