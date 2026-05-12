import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listPartners } from "@/lib/data/partners";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const partners = await listPartners();
  return NextResponse.json(partners);
}
