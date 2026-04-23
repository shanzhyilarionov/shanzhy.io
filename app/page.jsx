"use client";

import dynamic from "next/dynamic";

const Tesseract = dynamic(
  () => import("../components/Tesseract"),
  { ssr: false }
);

export default function Page() {
  return <Tesseract />;
}