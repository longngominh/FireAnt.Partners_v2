"use client";

import Link from "next/link";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type PartnerDetailLinkProps = {
  href: string;
};

export function PartnerDetailLink({ href }: PartnerDetailLinkProps) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={`size-7 ${isLoading ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      aria-disabled={isLoading}
    >
      <Link
        href={href}
        aria-label={isLoading ? "Đang mở chi tiết" : "Xem chi tiết"}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }

          setIsLoading(true);
        }}
      >
        {isLoading ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <ExternalLinkIcon className="size-3.5" />
        )}
      </Link>
    </Button>
  );
}
