import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex justify-center" aria-label="WebTenda"><Logo className="h-10 w-auto text-stone-900" /></Link>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
