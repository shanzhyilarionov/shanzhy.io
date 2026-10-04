"use client";

import { createContext, useContext } from "react";

const PageExitContext = createContext({ exiting: false, settleMs: 0 });

export function PageExitProvider({ exiting, settleMs = 0, children }) {
  return (
    <PageExitContext.Provider value={{ exiting, settleMs }}>
      {children}
    </PageExitContext.Provider>
  );
}

export function usePageExiting() {
  return useContext(PageExitContext).exiting;
}

export function usePageExitSettleMs() {
  return useContext(PageExitContext).settleMs;
}
