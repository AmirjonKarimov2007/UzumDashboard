"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { useEffect, useState } from "react";
import { useDashboardStore } from "@/stores/dashboard-store";

function ThemeSync() {
  const theme = useDashboardStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useDashboardStore((s) => s.theme);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      {children}
      <Toaster
        position="top-right"
        theme={theme}
        toastOptions={
          theme === "light"
            ? { style: { background: "#ffffff", border: "1px solid #e4e4e7", color: "#18181b" } }
            : { style: { background: "#0f0f16", border: "1px solid #1c1c24", color: "#e4e4e7" } }
        }
      />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}