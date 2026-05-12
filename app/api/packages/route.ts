import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listPackages } from "@/lib/data/packages";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const packages = await listPackages();
  return NextResponse.json(packages);
}
