"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithFireAnt() {
  await signIn("identity-server4", { redirectTo: "/dashboard" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login?loggedout=1" });
}
