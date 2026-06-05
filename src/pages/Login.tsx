export default function Login() {
  return (
    <main class="page-shell">
      <section class="page-card auth-card">
        <p class="eyebrow">Login</p>
        <h1>Save your drafts.</h1>
        <p>Continue with Google to create an account or log back in.</p>
        <form method="post" action="/api/login" class="auth-form">
          <button class="button primary" type="submit">
            Continue with Google
          </button>
        </form>
      </section>
    </main>
  );
}
