import React from 'react';

interface OutlinerProps {
  clipsCount: number;
  onSelectScene: () => void;
}

const Outliner: React.FC<OutlinerProps> = ({ clipsCount, onSelectScene }) => {
  return (
    <div data-testid="outliner" className="sidebar">
      <div className="panel-title">Outliner</div>
      <div className="text-xs space-y-0.5">
        <div
          className="cursor-pointer hover:bg-slate-700 px-1 rounded"
          onClick={onSelectScene}
        >
          Scene Root
        </div>
        {clipsCount > 0 && (
          <div className="pl-2 text-emerald-400">+ {clipsCount} Animation Clips</div>
        )}
        <div className="y-up-note mt-2">
          Y-up (Three). SMF Z-up + DQ converted via loaders/coord.ts
        </div>
      </div>
    </div>
  );
};

export default Outliner;
