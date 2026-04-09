import type { UserContext } from "@personal-agent-os/shared";

export function getUserContext(): UserContext {
  return {
    userId: "user_demo",
    email: "demo@example.com"
  };
}

