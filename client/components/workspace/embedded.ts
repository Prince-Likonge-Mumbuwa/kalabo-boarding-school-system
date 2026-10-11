// @/components/workspace/embedded.ts
//
// True inside a tabbed workspace (Admissions & Classes, Results & SBA,
// Attendance). Pages that are also tabs read it to:
//   - let the workspace draw the single sidebar layout (DashboardLayout
//     renders only its children when embedded), and
//   - leave out their own page title, which the workspace tab already shows.
import { createContext, useContext } from 'react';

export const EmbeddedContext = createContext(false);

export const useEmbedded = (): boolean => useContext(EmbeddedContext);
