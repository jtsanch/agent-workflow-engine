import { useAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { ApiError, getAuthMe, type AppAuthResponse } from "../lib/api.js";

type AppAuthState =
  | {
      status: "loading";
      isSignedIn: boolean;
      authReady: false;
      user: null;
      usage: null;
    }
  | {
      status: "signed_out";
      isSignedIn: false;
      authReady: true;
      user: null;
      usage: null;
    }
  | {
      status: "ready";
      isSignedIn: true;
      authReady: true;
      user: AppAuthResponse["user"];
      usage: AppAuthResponse["usage"];
    }
  | {
      status: "error";
      isSignedIn: true;
      authReady: true;
      user: null;
      usage: null;
      error: Error;
    }
  | {
      status: "pending_approval";
      isSignedIn: true;
      authReady: true;
      user: null;
      usage: null;
    };

const loadingState: AppAuthState = {
  status: "loading",
  isSignedIn: false,
  authReady: false,
  user: null,
  usage: null
};

export function useAppAuth(): AppAuthState {
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<AppAuthState>(loadingState);

  useEffect(() => {
    if (!isLoaded) {
      setState(loadingState);
      return;
    }

    if (!isSignedIn) {
      setState({
        status: "signed_out",
        isSignedIn: false,
        authReady: true,
        user: null,
        usage: null
      });
      return;
    }

    let isCancelled = false;
    setState({
      status: "loading",
      isSignedIn: true,
      authReady: false,
      user: null,
      usage: null
    });

    void getAuthMe()
      .then((result) => {
        if (isCancelled) {
          return;
        }

        setState({
          status: "ready",
          isSignedIn: true,
          authReady: true,
          user: result.user,
          usage: result.usage
        });
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && error.status === 403) {
          setState({
            status: "pending_approval",
            isSignedIn: true,
            authReady: true,
            user: null,
            usage: null
          });
          return;
        }

        setState({
          status: "error",
          isSignedIn: true,
          authReady: true,
          user: null,
          usage: null,
          error: error instanceof Error ? error : new Error("Failed to load authenticated user")
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return state;
}
