const { createClient } = window.supabase

// Initialize Supabase client
const SUPABASE_URL = 'YOUR_SUPABASE_URL'  // Replace with your URL
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'  // Replace with your public key

const supabase = createClient(https://hbesqtcjkcjmzowhgowe.supabase.co, eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiZXNxdGNqa2NqbXpvd2hnb3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNzkxNDksImV4cCI6MjA4MzY1NTE0OX0.lDMaKPazIegKhUMxszA3ArnypeIDDF4YmxR95SXxrII)

// Login function
const loginBtn = document.getElementById('login-btn')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value
  const password = passwordInput.value

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  })

  if (error) {
    alert('Login failed: ' + error.message)
  } else {
    alert('Login successful!')
    console.log(data)
  }
})