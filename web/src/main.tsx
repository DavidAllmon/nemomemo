import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App.js';
import { ThemeProvider } from '@/context/theme.js';
import { ViewSettingProvider } from '@/context/view-setting.js';
import { TooltipProvider } from '@/components/ui/overlays.js';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ViewSettingProvider>
          <TooltipProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </TooltipProvider>
        </ViewSettingProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
