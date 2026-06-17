export function MenuBar() {
  return (
    <div class="fixed w-full top-0 left-0 bg-background border-b border-b-lines z-10">
      <div class="flex justify-between">
        <div class="w-8"></div>
        <div class="flex">
          <button class="p-2 px-3 opacity-40 hover:opacity-100">delete</button>
        </div>
      </div>
    </div>
  );
}
