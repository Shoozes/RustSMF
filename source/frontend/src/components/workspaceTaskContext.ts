import { createContext, useContext } from 'react';

export type WorkspaceTaskContextValue = {
  mode: string;
  active: string;
  taskIds: string[];
  select: (id: string) => void;
};

export const WorkspaceTaskContext = createContext<WorkspaceTaskContextValue | null>(null);
export const useWorkspaceTask = () => useContext(WorkspaceTaskContext);
