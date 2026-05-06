"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  email,
  role,
  userId,
}: {
  email: string;
  role: string;
  userId?: string;
}) {
  const initials = email.slice(0, 2).toUpperCase();
  const avatarUrl = userId
    ? `https://static.fireant.vn/users/avatar/${userId}?width=65&height=65`
    : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <Avatar className="size-7">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={email} />}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden flex-col items-start text-xs leading-tight md:flex">
            <span className="font-medium">{email}</span>
            <Badge
              variant={role === "admin" ? "default" : "secondary"}
              className="h-4 px-1.5 text-[10px]"
            >
              {role === "admin" ? "Quản trị" : "Đối tác"}
            </Badge>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="text-sm font-medium">{email}</span>
          <span className="text-xs text-muted-foreground capitalize">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserIcon className="mr-2 size-4" />
          Hồ sơ
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => signOutAction()}
          className="text-destructive focus:text-destructive"
        >
          <LogOutIcon className="mr-2 size-4" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
