"use client";

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', width: '100vw', background: '#111' }}>
      {children}
    </div>
  );
} 