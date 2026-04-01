import { createContext, useContext, useState, ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface PageTitleContextType {
  title: string;
  icon: LucideIcon | null;
  setPageTitle: (title: string, icon?: LucideIcon) => void;
}

const PageTitleContext = createContext<PageTitleContextType | undefined>(undefined);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('Dashboard');
  const [icon, setIcon] = useState<LucideIcon | null>(null);

  const setPageTitle = (newTitle: string, newIcon?: LucideIcon) => {
    setTitle(newTitle);
    setIcon(newIcon || null);
  };

  return (
    <PageTitleContext.Provider value={{ title, icon, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  const context = useContext(PageTitleContext);
  if (!context) {
    throw new Error('usePageTitle must be used within PageTitleProvider');
  }
  return context;
}
