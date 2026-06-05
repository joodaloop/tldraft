import { A, useParams } from '@solidjs/router'

export default function Draft() {
  const params = useParams()

  return (
    <main class="page-shell">
      <section class="page-card">
        <p class="eyebrow">Draft</p>
        <h1>{params.id}</h1>
        <p>This page is ready to host the editor for draft “{params.id}”.</p>
        <A class="button" href="/">
          Back home
        </A>
      </section>
    </main>
  )
}
