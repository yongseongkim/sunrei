'use client';

import { MapPin } from 'lucide-react';

interface HeaderProps {
  onViewMarkersClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onViewMarkersClick }) => {
  return (
    <header className="w-full h-14 lg:h-16 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <MapPin className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
        </div>

        <div className="flex flex-col">
          <h1 className="text-base lg:text-lg font-bold text-foreground">
            성지순례
          </h1>
          <p className="hidden lg:block text-xs text-muted-foreground">
            좋아하는 작품의 촬영지를 찾아보세요
          </p>
        </div>
      </div>
    </header>
  );
};

export default Header;
