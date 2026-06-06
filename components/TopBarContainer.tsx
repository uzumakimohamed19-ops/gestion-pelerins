'use client';

export default function TopBarContainer() {
  return (
    <div 
      className="w-full bg-transparent absolute top-0 left-0 pointer-events-none z-[9999]"
      style={{ height: 'env(safe-area-inset-top)' }}
    />
  );
}