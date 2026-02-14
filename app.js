const { createClient } = supabase;

// Initialize Supabase client
const SUPABASE_URL = 'https://hbesqtcjkcjmzowhgowe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZXNxdGNqa2NqbXpvd2hnb3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxNDksImV4cCI6MjA4MzY1NTE0OX0.lDMaKPazIegKhUMxszA3ArnypeIDDF4YmxR95SXxrII';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Login function
const loginBtn = document.getElementById('login-btn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value;
  const password = passwordInput.value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert('Login failed: ' + error.message);
  } else {
    alert('Login successful!');
    console.log(data);
  }
});
