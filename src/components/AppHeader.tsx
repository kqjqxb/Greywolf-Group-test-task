import { ThemeToggle } from './ThemeToggle';

export function AppHeader() {
  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__brand">
          <h1 className="header__title">PDF Insight</h1>
          <p className="header__tagline">Analiza dokumentów PDF z pomocą AI</p>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
