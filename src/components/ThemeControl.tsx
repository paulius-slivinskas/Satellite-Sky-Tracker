import { Button } from '@heroui/react';
import type { Theme } from '../state/theme';

export function ThemeControl({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (next: Theme) => void;
}) {
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Button
      className="theme-control map-control-button"
      variant="secondary"
      isIconOnly
      aria-label={label}
      onPress={() => onChange(theme === 'dark' ? 'light' : 'dark')}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
          </>
        ) : (
          <path d="M20.1 15.3A8.5 8.5 0 0 1 8.7 3.9 8.5 8.5 0 1 0 20.1 15.3Z" />
        )}
      </svg>
    </Button>
  );
}
