import { Inter } from "next/font/google";
import Shell from "../components/shell";
import EntryLoading from "../components/entry-loading";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: {
    default: "Shanzhy",
    template: "%s | Shanzhy",
  },
  description: "Independent developer based in Edmonton, Canada.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <EntryLoading>
          <Shell>{children}</Shell>
        </EntryLoading>
      </body>
    </html>
  );
}
