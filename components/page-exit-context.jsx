"use client";

import { createContext, useContext } from "react";

const PageExitContext = createContext(false);

export function PageExitProvider({ exiting, children }) {
  return (
    <PageExitContext.Provider value={exiting}>
      {children}
    </PageExitContext.Provider>
  );
}

export function usePageExiting() {
  return useContext(PageExitContext);
}
