"use client";

/**
 * Service Worker Update Banner
 *
 * Displays when a waiting service worker is available (new app version).
 * Implements the deferred activation policy (#984):
 *  - skipWaiting: false — new SW remains waiting, never auto-activates
 *  - User explicitly chooses to reload and activate the new version
 *  - Coordinates with providers.tsx controllerchange listener
 *
 * Constraints:
 *  - Only shown when a waiting worker exists (registration.waiting != null)
 *  - Dismissible; will re-appear if another update arrives
 *  - No reload occurs until user clicks "Update"
 *  - Blocked during active wallet signing (deferred until confirmed/cancelled)
 *
 * UX flow:
 *  1. Registration registers SW + listens for updates
 *  2. New SW installs and enters "waiting" state
 *  3. Banner appears with "Update" and "Later" buttons
 *  4. User clicks "Update" → sends SKIP_WAITING postMessage → page reloads
 *  5. New SW claims clients + controllerchange fires → provider guards signing state
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store/uiStore";

export function SwUpdateBanner() {
  const t = useTranslations("swUpdateBanner");
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);
  const isSigning = useUIStore((s) => s.txState.status === "signing");
  const [deferredReload, setDeferredReload] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Get any existing registration
    navigator.serviceWorker.ready.then((registration) => {
      // Check if there's already a waiting worker
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setVisible(true);
      }

      // Listen for new installations (updates)
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New SW installed, older one still active → show banner
            setWaitingWorker(newWorker);
            setVisible(true);
          }
        });
      });

      // Check for updates every hour
      const interval = setInterval(() => {
        registration.update().catch((err) => {
          console.warn("[SwUpdateBanner] Failed to check for updates:", err);
        });
      }, 60 * 60 * 1000);

      return () => clearInterval(interval);
    });
  }, []);

  const handleUpdate = () => {
    if (isSigning) {
      // Defer reload until signing completes
      setDeferredReload(true);
      setVisible(false);
      return;
    }

    if (!waitingWorker) return;

    // Mark that this update was user-triggered (for providers.tsx to detect)
    sessionStorage.setItem("pwa-update-triggered", "true");

    // Send SKIP_WAITING to the waiting worker
    // This causes it to activate immediately without waiting for all clients to unload
    waitingWorker.postMessage({ type: "SKIP_WAITING" });

    // The waiting worker will claim all clients, triggering controllerchange
    // in providers.tsx, which will handle the page reload
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  // If signing was active and update was deferred, retry showing banner when signing completes
  useEffect(() => {
    if (deferredReload && !isSigning) {
      setDeferredReload(false);
      if (waitingWorker) {
        setVisible(true);
      }
    }
  }, [isSigning, deferredReload, waitingWorker]);

  return (
    <AnimatePresence>
      {visible && waitingWorker && (
        <motion.div
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-4 bg-blue-50 px-4 py-3 shadow-md dark:bg-blue-950"
          role="status"
          aria-live="polite"
          aria-label={t("ariaLabel")}
        >
          <div className="flex flex-1 items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {isSigning ? t("updateDeferredDuringSigning") : t("updateAvailable")}
            </p>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
            >
              {t("later")}
            </Button>
            <Button
              size="sm"
              onClick={handleUpdate}
              disabled={isSigning}
              className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              {t("update")}
            </Button>
          </div>

          <button
            onClick={handleDismiss}
            className="inline-flex flex-shrink-0 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
