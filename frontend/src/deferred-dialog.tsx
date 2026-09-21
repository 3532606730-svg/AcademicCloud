import { Component, Suspense, lazy, useMemo, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { useLanguage } from "./i18n-react.tsx";
import { useModalDialog } from "./use-modal-dialog.ts";

type DialogControls = { onClose: () => void; returnFocus?: HTMLElement | null };

function DialogStatus({ onClose, returnFocus, onRetry }: DialogControls & { onRetry?: () => void }) {
  const { t } = useLanguage();
  const dialogRef = useModalDialog(onClose, false, returnFocus);
  return <dialog ref={dialogRef} className="deferred-dialog" aria-label={t("dialog.loadingTitle")}>
    <p role={onRetry ? "alert" : "status"}>{t(onRetry ? "dialog.loadFailed" : "dialog.loading")}</p>
    <div className="deferred-dialog-actions">
      {onRetry && <button className="button" type="button" onClick={onRetry}>{t("preview.retry")}</button>}
      <button className="button button--quiet" type="button" onClick={onClose}>{t("preview.close")}</button>
    </div>
  </dialog>;
}

class DialogBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// Optional work surfaces do not belong to the Library/Preview startup path.
// A failed chunk can be retried with a fresh lazy instance without reloading
// the application or discarding the document session underneath it.
function deferDialog<P extends DialogControls>(load: () => Promise<{ default: ComponentType<P> }>) {
  let cachedDialog = lazy(load);
  return function DeferredDialog(props: P) {
    const [attempt, setAttempt] = useState(0);
    const LoadedDialog = useMemo(() => cachedDialog, [attempt]);
    const retry = () => {
      cachedDialog = lazy(load);
      setAttempt((value) => value + 1);
    };
    return <DialogBoundary key={attempt}
      fallback={<DialogStatus {...props} onRetry={retry} />}>
      <Suspense fallback={<DialogStatus {...props} />}>
        <LoadedDialog {...props} />
      </Suspense>
    </DialogBoundary>;
  };
}

export const ResourceDetailsDialog = deferDialog<ComponentProps<typeof import("./resource-details.tsx").ResourceDetailsDialog>>(
  () => import("./resource-details.tsx").then((module) => ({ default: module.ResourceDetailsDialog })),
);
export const CitationDialog = deferDialog<ComponentProps<typeof import("./citation.tsx").CitationDialog>>(
  () => import("./citation.tsx").then((module) => ({ default: module.CitationDialog })),
);
export const BatchCatalogDialog = deferDialog<ComponentProps<typeof import("./batch-catalog.tsx").BatchCatalogDialog>>(
  () => import("./batch-catalog.tsx").then((module) => ({ default: module.BatchCatalogDialog })),
);
export const BatchNamingDialog = deferDialog<ComponentProps<typeof import("./batch-naming.tsx").BatchNamingDialog>>(
  () => import("./batch-naming.tsx").then((module) => ({ default: module.BatchNamingDialog })),
);
export const WorkspaceDialog = deferDialog<ComponentProps<typeof import("./workspace.tsx").WorkspaceDialog>>(
  () => import("./workspace.tsx").then((module) => ({ default: module.WorkspaceDialog })),
);
