import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

namespace AppHeaderView {
  export type NavigationItem = {
    to: string;
    label: string;
  };

  export const navigationItems: NavigationItem[] = [
    { to: "/", label: "Analyzer" },
    { to: "/import/chess-com", label: "Chess.com" },
    { to: "/about", label: "About" },
  ];

  export const navigationLinkClassName = "text-gray-600 hover:text-indigo-600 font-medium transition-colors";
}

export default function AppHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="min-w-0 flex items-center justify-between gap-3 py-3 sm:py-4">
          <Link to="/" className="min-w-0 flex items-center gap-2 sm:gap-3">
            <img src="/favicon.svg" alt="Chess Analysis logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
            <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight">
              CHESS<span className="text-indigo-600">ANALYSIS</span>
            </h1>
          </Link>

          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-md border border-gray-200 text-gray-700 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsMobileMenuOpen((value) => !value)}
          >
            <span className="sr-only">{isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}</span>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>

          <nav className="hidden md:flex items-center gap-4">
            {AppHeaderView.navigationItems.map((item) => (
              <Link key={item.to} to={item.to} className={AppHeaderView.navigationLinkClassName}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {isMobileMenuOpen && (
          <nav id="mobile-navigation" className="md:hidden pb-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
            {AppHeaderView.navigationItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`${AppHeaderView.navigationLinkClassName} px-1 py-1`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
