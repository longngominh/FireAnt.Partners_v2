import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { email, role, userId } = session.user;

  return (
    <SessionProvider>
      <div className="flex min-h-screen">
        <Sidebar role={role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar email={email ?? ""} role={role} userId={userId ?? undefined} />
          <main className="flex-1 overflow-y-auto bg-muted/30">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
