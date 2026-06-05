import { A } from '@solidjs/router'

export default function Settings() {
  return (
    <main class="page-shell">
      <section class="page-card">
        <p class="eyebrow">Settings</p>
        <h1>Workspace settings</h1>
        <p>Manage editor preferences and collaboration defaults for your drafts.</p>
        <A class="button" href="/">
          Back home
        </A>
      </section>
    </main>
  )
}
