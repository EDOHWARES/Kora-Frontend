import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SwUpdateBanner } from "@/components/pwa/SwUpdateBanner";

// Mock dependencies
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      "swUpdateBanner.ariaLabel": "Service worker update available",
      "swUpdateBanner.updateAvailable": "A new version of Kora Protocol is available.",
      "swUpdateBanner.updateDeferredDuringSigning":
        "Update available — will be applied after you complete signing.",
      "swUpdateBanner.update": "Update",
      "swUpdateBanner.later": "Later",
      "swUpdateBanner.close": "Close update banner",
    };
    return translations[key] || key;
  },
}));

vi.mock("@/store/uiStore", () => ({
  useUIStore: (selector: (state: any) => any) =>
    selector({
      txState: { status: "idle" },
    }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("SwUpdateBanner Component", () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("does not render when there is no waiting service worker", () => {
    render(<SwUpdateBanner />);
    expect(screen.queryByText(/A new version/)).not.toBeInTheDocument();
  });

  it("displays update banner when a waiting worker is available", async () => {
    // Mock registration.waiting
    const mockWaitingWorker = { postMessage: vi.fn() };
    const mockRegistration = {
      waiting: mockWaitingWorker,
      addEventListener: vi.fn(),
    };

    navigator.serviceWorker.ready = Promise.resolve(mockRegistration as any);

    render(<SwUpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/A new version/)).toBeInTheDocument();
    });
  });

  it("shows deferred message when user is actively signing", async () => {
    const mockWaitingWorker = { postMessage: vi.fn() };
    const mockRegistration = {
      waiting: mockWaitingWorker,
      addEventListener: vi.fn(),
    };

    navigator.serviceWorker.ready = Promise.resolve(mockRegistration as any);

    // Mock signing state
    vi.mocked(useUIStore).mockImplementation((selector: any) =>
      selector({ txState: { status: "signing" } })
    );

    render(<SwUpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/will be applied after you complete signing/)).toBeInTheDocument();
    });
  });

  it("sends SKIP_WAITING message when user confirms update", async () => {
    const mockWaitingWorker = { postMessage: vi.fn() };
    const mockRegistration = {
      waiting: mockWaitingWorker,
      addEventListener: vi.fn(),
    };

    navigator.serviceWorker.ready = Promise.resolve(mockRegistration as any);

    render(<SwUpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/A new version/)).toBeInTheDocument();
    });

    const updateButton = screen.getByText("Update");
    fireEvent.click(updateButton);

    expect(mockWaitingWorker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("sets sessionStorage flag when sending SKIP_WAITING", async () => {
    const mockWaitingWorker = { postMessage: vi.fn() };
    const mockRegistration = {
      waiting: mockWaitingWorker,
      addEventListener: vi.fn(),
    };

    navigator.serviceWorker.ready = Promise.resolve(mockRegistration as any);

    render(<SwUpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/A new version/)).toBeInTheDocument();
    });

    const updateButton = screen.getByText("Update");
    fireEvent.click(updateButton);

    expect(sessionStorage.getItem("pwa-update-triggered")).toBe("true");
  });

  it("dismisses banner when user clicks Later", async () => {
    const mockWaitingWorker = { postMessage: vi.fn() };
    const mockRegistration = {
      waiting: mockWaitingWorker,
      addEventListener: vi.fn(),
    };

    navigator.serviceWorker.ready = Promise.resolve(mockRegistration as any);

    render(<SwUpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/A new version/)).toBeInTheDocument();
    });

    const laterButton = screen.getByText("Later");
    fireEvent.click(laterButton);

    expect(screen.queryByText(/A new version/)).not.toBeInTheDocument();
  });

  it("disables Update button when user is actively signing", async () => {
    const mockWaitingWorker = { postMessage: vi.fn() };
    const mockRegistration = {
      waiting: mockWaitingWorker,
      addEventListener: vi.fn(),
    };

    navigator.serviceWorker.ready = Promise.resolve(mockRegistration as any);

    vi.mocked(useUIStore).mockImplementation((selector: any) =>
      selector({ txState: { status: "signing" } })
    );

    render(<SwUpdateBanner />);

    await waitFor(() => {
      const updateButton = screen.getByText("Update") as HTMLButtonElement;
      expect(updateButton.disabled).toBe(true);
    });
  });

  it("defers reload until signing completes", async () => {
    const mockWaitingWorker = { postMessage: vi.fn() };
    const mockRegistration = {
      waiting: mockWaitingWorker,
      addEventListener: vi.fn(),
    };

    let uiStoreState = { txState: { status: "signing" } };

    vi.mocked(useUIStore).mockImplementation((selector: any) => selector(uiStoreState));

    navigator.serviceWorker.ready = Promise.resolve(mockRegistration as any);

    const { rerender } = render(<SwUpdateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/will be applied after you complete signing/)).toBeInTheDocument();
    });

    // User tries to update while signing
    const updateButton = screen.getByText("Update");
    fireEvent.click(updateButton);

    // Banner should be dismissed but no SKIP_WAITING sent yet
    expect(mockWaitingWorker.postMessage).not.toHaveBeenCalled();
    expect(screen.queryByText(/will be applied after you complete signing/)).not.toBeInTheDocument();

    // Simulate signing completion
    uiStoreState = { txState: { status: "idle" } };
    rerender(<SwUpdateBanner />);

    // Banner should re-appear after signing completes
    await waitFor(() => {
      expect(screen.getByText(/A new version/)).toBeInTheDocument();
    });
  });

  it("checks for updates every hour", async () => {
    const mockWaitingWorker = { postMessage: vi.fn() };
    const updateFn = vi.fn().mockResolvedValue(undefined);
    const mockRegistration = {
      waiting: mockWaitingWorker,
      update: updateFn,
      addEventListener: vi.fn(),
    };

    navigator.serviceWorker.ready = Promise.resolve(mockRegistration as any);

    render(<SwUpdateBanner />);

    // Fast-forward 60 minutes (3600000 ms)
    vi.useFakeTimers();
    vi.advanceTimersByTime(60 * 60 * 1000);

    await waitFor(() => {
      expect(updateFn).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });
});
