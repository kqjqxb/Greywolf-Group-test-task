import { useEffect, useState } from 'react';
import { SparkIcon } from './icons';
import { ThemeToggle } from './ThemeToggle';

/** True once the page is scrolled: the sticky header then gets its glass background. */
function useIsScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return scrolled;
}

export function AppHeader() {
  const scrolled = useIsScrolled();
  return (
    <header className={`header${scrolled ? ' header--scrolled' : ''}`}>
      <div className="container header__inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <SparkIcon />
          </span>
          {/* The page's h1 stays the same in every state; the hero title below is an h2. */}
          <h1 className="brand__name">PDF Insight</h1>
          <p className="brand__tagline">Analiza dokumentów PDF z pomocą AI</p>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
