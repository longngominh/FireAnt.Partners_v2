"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent, type SidebarProps } from "./sidebar";

/** Menu trượt trên điện thoại — cùng nội dung với thanh bên của từng không gian. */
export function MobileNav(props: Omit<SidebarProps, "footer">) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="size-10"
        aria-label="Mở menu"
      >
        <MenuIcon className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          data-workspace={props.workspace}
          className="w-72 overflow-y-auto bg-sidebar p-0 text-sidebar-foreground"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>
          <SidebarContent {...props} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
