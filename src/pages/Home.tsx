import { A } from '@solidjs/router'

export default function Home() {
  return (
    <main class="page-shell">
      <section class="page-card hero-card">
        <p class="eyebrow">Drafts</p>
        <h1>Write together, revise faster.</h1>
        <p>
          Open a draft, invite collaborators, and keep focused on the next edit.
        </p>
        <div class="actions">
          <A class="button primary" href="/draft/welcome">
            Open sample draft
          </A>
          <A class="button" href="/settings">
            Settings
          </A>
        </div>
      </section>
    </main>
  )
}
