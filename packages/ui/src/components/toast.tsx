"use client";

import { Toast } from "@base-ui/react/toast";
import { Button } from "@repo/ui/components/button";
import { CircleCheckIcon, CircleXIcon, InfoIcon, LoaderCircleIcon, XIcon } from "lucide-react";

// Add notifications from client event handlers or effects, after mounting one Toaster.
export const toast = Toast.createToastManager();

interface ToasterLabels {
  dismissLabel?: string;
  regionLabel?: string;
}

function ToastList({ dismissLabel, regionLabel }: Required<ToasterLabels>) {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport
        aria-label={regionLabel}
        className="pointer-events-none fixed top-4 right-4 left-4 z-50 flex flex-col gap-3 outline-none sm:left-auto sm:w-96"
      >
        {toasts.map((notification) => {
          const Icon =
            notification.type === "loading"
              ? LoaderCircleIcon
              : notification.type === "error"
                ? CircleXIcon
                : notification.type === "success"
                  ? CircleCheckIcon
                  : InfoIcon;

          return (
            <Toast.Root
              key={notification.id}
              toast={notification}
              data-slot="toast"
              data-toast-id={notification.id}
              swipeDirection={["up", "right"]}
              className="pointer-events-auto relative transform-[translate(var(--toast-swipe-movement-x),var(--toast-swipe-movement-y))] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg outline-none transition-[opacity,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring data-ending-style:opacity-0 data-limited:hidden data-starting-style:opacity-0 data-swiping:transition-none motion-reduce:transition-none"
            >
              <Toast.Content className="flex items-start gap-3 pr-7">
                <Icon
                  aria-hidden="true"
                  className={
                    notification.type === "loading"
                      ? "mt-0.5 size-5 shrink-0 motion-safe:animate-spin"
                      : "mt-0.5 size-5 shrink-0"
                  }
                />
                <div className="min-w-0 flex-1">
                  <Toast.Title className="text-sm font-semibold" />
                  <Toast.Description className="mt-1 text-sm leading-relaxed text-muted-foreground" />
                  <Toast.Action render={<Button size="sm" className="mt-3" />} />
                </div>
              </Toast.Content>
              <Toast.Close
                aria-label={dismissLabel}
                aria-hidden={false}
                render={
                  <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" />
                }
              >
                <XIcon aria-hidden="true" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function Toaster({
  dismissLabel = "Dismiss notification",
  regionLabel = "Notifications",
}: ToasterLabels = {}) {
  return (
    <Toast.Provider toastManager={toast}>
      <ToastList dismissLabel={dismissLabel} regionLabel={regionLabel} />
    </Toast.Provider>
  );
}
