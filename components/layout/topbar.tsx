import { UserMenu } from "./user-menu";

export function Topbar({
  email,
  role,
  userId,
  title,
}: {
  email: string;
  role: string;
  userId?: string;
  title?: string;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-3">
        {title ? (
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <UserMenu email={email} role={role} userId={userId} />
      </div>
    </header>
  );
}
