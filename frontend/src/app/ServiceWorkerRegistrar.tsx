"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function registerServiceWorkerOnce(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);

  return navigator.serviceWorker
    .getRegistration()
    .then((existing) => {
      if (existing) return existing;
      return navigator.serviceWorker.register("/sw.js").catch(() => null);
    })
    .catch(() => null);
}

export default function ServiceWorkerRegistrar() {
  const pathname = usePathname();
  const triedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tryRegister = async () => {
      if (cancelled) return;
      if (!("serviceWorker" in navigator)) return;

      // If a controller exists, SW is already active for this page
      if (navigator.serviceWorker.controller) return;

      await registerServiceWorkerOnce();
      // No reliance on a global flag; controller may appear shortly after
    };

    // Immediate attempt on mount (only once per component lifecycle)
    if (!triedRef.current) {
      triedRef.current = true;
      // If DOM is still loading, defer a tick but do not wait for window.load
      if (document.readyState === "loading") {
        setTimeout(tryRegister, 0);
      } else {
        void tryRegister();
      }
    }

    // Retry on route changes (App Router) when controller is still missing
    void tryRegister();

    // Retry when page becomes visible (handles fast redirects/autologin)
    const onVisibility = () => {
      if (!navigator.serviceWorker.controller) void tryRegister();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Retry when page is shown from bfcache/navigation
    const onPageShow = () => {
      if (!navigator.serviceWorker.controller) void tryRegister();
    };
    window.addEventListener("pageshow", onPageShow);

    // Also react to controllerchange to stop further retries if desired
    const onControllerChange = () => {
      // Once controller is set, no more action needed
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [pathname]);

  return null;
}


