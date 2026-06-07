export default function Home() {
  return (
    <main class="max-w-sm mx-auto my-32">
      <h1 class="text-5xl font-bold text-center mb-6">tldraft</h1>
      <p class="mb-4">Realtime collaborative text editing that also works completely offline, without an account.</p>

      <p>
        The app will <em>always</em> load, regardless of if you're online, and any edits you make while offline will be
        saved once you reconnect later.
      </p>

      <h2 class="mt-24 mb-6 font-black text-center"> updates</h2>

      <div class="grid gap-6">
        <article>
          <h3 class="mb-1.5 opacity-40">For Nihal,</h3>
          <p>Improved the sidebar experience by making separate ones for mobile/desktop.</p>
        </article>

        <article>
          <h3 class="mb-1.5 opacity-40">For Manav,</h3>
          <p>Improved collaborative editing, by keeping the cursor position stable in the face of remote updates.</p>
        </article>
        <article>
          <h3 class="mb-1.5 opacity-40">For Nobu,</h3>
          <p>Fixed mobile functionality by adding an open/close button to the sidebar.</p>
        </article>
        <article>
          <h3 class="mb-1.5 opacity-40">For Nihal,</h3>
          <p>Added the ability to delete pages if you own them, or just forget them (remove from sidebar) if not.</p>
        </article>
      </div>
    </main>
  );
}
