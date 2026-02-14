const { createClient } = supabase;

// Initialize Supabase client
const SUPABASE_URL = 'https://hbesqtcjkcjmzowhgowe.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

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
