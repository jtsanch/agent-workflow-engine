export interface ClerkRequestAuth {
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AuthContext {
  clerkUserId: string;
  localUserId: string;
  role: "admin" | "user";
  email: string;
}
