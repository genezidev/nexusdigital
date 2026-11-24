import { NotFoundState } from "@/components/app/states";

export default function NotFound() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-10">
      <div className="w-full">
        <NotFoundState />
      </div>
    </main>
  );
}
